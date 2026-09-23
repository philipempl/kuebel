use crate::storages::{self, Storage};
use aws_config::{BehaviorVersion, Region};
use aws_credential_types::Credentials;
use aws_sdk_s3::primitives::ByteStream;
use aws_sdk_s3::Client;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Gebaute S3-Clients pro Storage. Ohne den Cache liest jede einzelne Operation
/// die Zugangsdaten neu aus dem System-Schluesselbund, und macOS fragt dann bei
/// jedem Klick erneut nach dem Passwort.
#[derive(Default)]
pub struct ClientCache(Mutex<HashMap<String, Client>>);

impl ClientCache {
    pub fn invalidate(&self, id: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(id);
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Object {
    pub key: String,
    pub name: String,
    pub size: i64,
    pub last_modified: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Listing {
    pub prefix: String,
    pub folders: Vec<String>,
    pub files: Vec<Object>,
}

pub async fn client(storage: &Storage, access_key: &str, secret_key: &str) -> Client {
    let creds = Credentials::new(access_key, secret_key, None, None, "complioty-storage");
    let region = if storage.region.is_empty() {
        "us-east-1".to_string()
    } else {
        storage.region.clone()
    };
    let shared = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(region))
        .credentials_provider(creds)
        .endpoint_url(&storage.endpoint)
        .load()
        .await;
    let conf = aws_sdk_s3::config::Builder::from(&shared)
        .force_path_style(storage.path_style)
        .build();
    Client::from_conf(conf)
}

pub async fn client_for(
    app: &AppHandle,
    storage_id: &str,
) -> Result<Client, Box<dyn std::error::Error>> {
    // Eigener Block: der MutexGuard darf nicht ueber das await hinweg leben.
    let cached = {
        let cache = app.state::<ClientCache>();
        let map = cache.0.lock().map_err(|_| "Client-Cache gesperrt")?;
        map.get(storage_id).cloned()
    };
    if let Some(c) = cached {
        return Ok(c);
    }

    let storage = storages::get(app, storage_id)?;
    let (access, secret) = storages::credentials(app, storage_id)?;
    let built = client(&storage, &access, &secret).await;

    {
        let cache = app.state::<ClientCache>();
        let mut map = cache.0.lock().map_err(|_| "Client-Cache gesperrt")?;
        map.insert(storage_id.to_string(), built.clone());
    }
    Ok(built)
}

pub async fn list_buckets(client: &Client) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let out = client.list_buckets().send().await?;
    Ok(out
        .buckets()
        .iter()
        .filter_map(|b| b.name().map(|n| n.to_string()))
        .collect())
}

pub async fn list_objects(
    client: &Client,
    bucket: &str,
    prefix: &str,
) -> Result<Listing, Box<dyn std::error::Error>> {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    let mut token: Option<String> = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix(prefix)
            .delimiter("/");
        if let Some(t) = &token {
            req = req.continuation_token(t);
        }
        let out = req.send().await?;

        for cp in out.common_prefixes() {
            if let Some(p) = cp.prefix() {
                folders.push(p.to_string());
            }
        }
        for obj in out.contents() {
            let key = obj.key().unwrap_or_default().to_string();
            if key == prefix {
                continue; // Ordner-Marker-Objekt
            }
            let name = key.strip_prefix(prefix).unwrap_or(&key).to_string();
            files.push(Object {
                key,
                name,
                size: obj.size().unwrap_or(0),
                last_modified: obj.last_modified().map(|d| d.to_string()),
            });
        }

        match out.next_continuation_token() {
            Some(t) if out.is_truncated().unwrap_or(false) => token = Some(t.to_string()),
            _ => break,
        }
    }

    Ok(Listing {
        prefix: prefix.to_string(),
        folders,
        files,
    })
}

pub async fn upload(
    client: &Client,
    bucket: &str,
    key: &str,
    path: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let body = ByteStream::from_path(path).await?;
    client
        .put_object()
        .bucket(bucket)
        .key(key)
        .body(body)
        .send()
        .await?;
    Ok(())
}

pub async fn delete(client: &Client, bucket: &str, key: &str) -> Result<(), Box<dyn std::error::Error>> {
    if key.ends_with('/') {
        // Ordner: alle Objekte unter dem Prefix löschen
        let mut token: Option<String> = None;
        loop {
            let mut req = client.list_objects_v2().bucket(bucket).prefix(key);
            if let Some(t) = &token {
                req = req.continuation_token(t);
            }
            let out = req.send().await?;
            for obj in out.contents() {
                if let Some(k) = obj.key() {
                    client.delete_object().bucket(bucket).key(k).send().await?;
                }
            }
            match out.next_continuation_token() {
                Some(t) if out.is_truncated().unwrap_or(false) => token = Some(t.to_string()),
                _ => break,
            }
        }
        return Ok(());
    }
    client.delete_object().bucket(bucket).key(key).send().await?;
    Ok(())
}

#[derive(Debug, Serialize)]
pub struct Hit {
    pub bucket: String,
    pub key: String,
    pub name: String,
    pub size: i64,
    pub last_modified: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub hits: Vec<Hit>,
    pub scanned: u64,
    pub truncated: bool,
    pub cancelled: bool,
    pub skipped: Vec<String>,
}

pub async fn create_bucket(
    client: &Client,
    bucket: &str,
    region: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut req = client.create_bucket().bucket(bucket);
    // us-east-1 lehnt eine LocationConstraint ab, alle anderen Regionen verlangen sie.
    if !region.is_empty() && region != "us-east-1" {
        let cfg = aws_sdk_s3::types::CreateBucketConfiguration::builder()
            .location_constraint(aws_sdk_s3::types::BucketLocationConstraint::from(region))
            .build();
        req = req.create_bucket_configuration(cfg);
    }
    req.send().await?;
    Ok(())
}

/// Durchsucht die angegebenen Buckets rekursiv. S3 kennt keine Suche, also wird
/// jedes Objekt aufgelistet und clientseitig gefiltert - entsprechend teuer.
pub async fn search(
    client: &Client,
    buckets: &[String],
    query: &str,
    limit: usize,
    cancel: &std::sync::atomic::AtomicBool,
    on_progress: impl Fn(&str, u64, usize),
) -> Result<SearchResult, Box<dyn std::error::Error>> {
    use std::sync::atomic::Ordering;

    let needle = query.to_lowercase();
    let mut hits: Vec<Hit> = Vec::new();
    let mut scanned: u64 = 0;
    let mut skipped: Vec<String> = Vec::new();
    let mut truncated = false;

    'outer: for bucket in buckets {
        let mut token: Option<String> = None;
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Ok(SearchResult { hits, scanned, truncated, cancelled: true, skipped });
            }

            let mut req = client.list_objects_v2().bucket(bucket);
            if let Some(t) = &token {
                req = req.continuation_token(t);
            }
            // Ein Bucket in einer anderen Region oder ohne Leserecht darf die
            // ganze Suche nicht abbrechen.
            let out = match req.send().await {
                Ok(o) => o,
                Err(_) => {
                    skipped.push(bucket.clone());
                    continue 'outer;
                }
            };

            for obj in out.contents() {
                scanned += 1;
                let key = obj.key().unwrap_or_default();
                if key.is_empty() || key.ends_with('/') {
                    continue; // Ordner-Marker
                }
                if !key.to_lowercase().contains(&needle) {
                    continue;
                }
                hits.push(Hit {
                    bucket: bucket.clone(),
                    key: key.to_string(),
                    name: key.rsplit('/').next().unwrap_or(key).to_string(),
                    size: obj.size().unwrap_or(0),
                    last_modified: obj.last_modified().map(|d| d.to_string()),
                });
                if hits.len() >= limit {
                    truncated = true;
                    break 'outer;
                }
            }

            on_progress(bucket, scanned, hits.len());

            match out.next_continuation_token() {
                Some(t) if out.is_truncated().unwrap_or(false) => token = Some(t.to_string()),
                _ => break,
            }
        }
    }

    Ok(SearchResult { hits, scanned, truncated, cancelled: false, skipped })
}

/// Groesste Textmenge, die als Vorschau uebertragen wird. Bilder und PDFs
/// laufen nicht hierueber, sondern werden vom preview://-Protokoll gestreamt.
const TEXT_MAX: i64 = 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct Preview {
    /// "image", "pdf", "text" oder "unsupported"
    pub kind: String,
    pub content_type: Option<String>,
    pub size: i64,
    pub last_modified: Option<String>,
    pub etag: Option<String>,
    pub truncated: bool,
    /// Nur bei kind == "text"
    pub text: Option<String>,
}

fn extension(key: &str) -> String {
    key.rsplit('/')
        .next()
        .unwrap_or(key)
        .rsplit_once('.')
        .map(|(_, e)| e.to_lowercase())
        .unwrap_or_default()
}

fn image_mime(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "tif" | "tiff" => "image/tiff",
        _ => return None,
    })
}

fn is_text(ext: &str) -> bool {
    matches!(
        ext,
        "txt" | "md" | "markdown" | "json" | "yaml" | "yml" | "toml" | "ini" | "conf" | "cfg"
            | "csv" | "tsv" | "log" | "xml" | "html" | "htm" | "css" | "scss" | "js" | "mjs"
            | "ts" | "tsx" | "jsx" | "rs" | "py" | "go" | "java" | "kt" | "rb" | "php" | "sh"
            | "bash" | "zsh" | "sql" | "env" | "gitignore" | "dockerfile" | "lock" | "svelte"
    )
}

/// Content-Type fuer die Auslieferung ueber das preview://-Protokoll.
pub fn mime_for(key: &str, reported: Option<&str>) -> String {
    let ext = extension(key);
    if let Some(m) = image_mime(&ext) {
        return m.to_string();
    }
    if ext == "pdf" {
        return "application/pdf".to_string();
    }
    match reported {
        Some(ct) if !ct.is_empty() && ct != "binary/octet-stream" => ct.to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

pub async fn preview(
    client: &Client,
    bucket: &str,
    key: &str,
) -> Result<Preview, Box<dyn std::error::Error>> {
    let head = client.head_object().bucket(bucket).key(key).send().await?;
    let size = head.content_length().unwrap_or(0);
    let content_type = head.content_type().map(|s| s.to_string());
    let ext = extension(key);
    let ct = content_type.clone().unwrap_or_default();

    let mut out = Preview {
        kind: "unsupported".into(),
        content_type: content_type.clone(),
        size,
        last_modified: head.last_modified().map(|d| d.to_string()),
        etag: head.e_tag().map(|s| s.trim_matches('"').to_string()),
        truncated: false,
        text: None,
    };

    if image_mime(&ext).is_some() || ct.starts_with("image/") {
        out.kind = "image".into();
        return Ok(out);
    }
    if ext == "pdf" || ct == "application/pdf" {
        out.kind = "pdf".into();
        return Ok(out);
    }
    if !(is_text(&ext) || ct.starts_with("text/") || ct.contains("json") || ct.contains("xml")) {
        return Ok(out);
    }

    let mut req = client.get_object().bucket(bucket).key(key);
    if size > TEXT_MAX {
        req = req.range(format!("bytes=0-{}", TEXT_MAX - 1));
        out.truncated = true;
    }
    let body = req.send().await?.body.collect().await?.into_bytes();
    out.kind = "text".into();
    out.text = Some(String::from_utf8_lossy(&body).into_owned());
    Ok(out)
}

/// Laedt ein Objekt vollstaendig. Nur fuer das preview://-Protokoll.
pub async fn fetch_object(
    client: &Client,
    bucket: &str,
    key: &str,
) -> Result<(Vec<u8>, String), Box<dyn std::error::Error>> {
    let out = client.get_object().bucket(bucket).key(key).send().await?;
    let mime = mime_for(key, out.content_type());
    let bytes = out.body.collect().await?.into_bytes().to_vec();
    Ok((bytes, mime))
}
