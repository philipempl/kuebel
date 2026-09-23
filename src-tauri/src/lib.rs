mod s3;
mod storages;

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use storages::{Storage, StorageInput};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};

/// Adressiert ein Objekt in einer preview://-URL. Das Frontend serialisiert das
/// als JSON und reicht es durch convertFileSrc().
#[derive(serde::Deserialize)]
struct PreviewRef {
    s: String,
    b: String,
    k: String,
}

fn parse_preview_uri(uri: &tauri::http::Uri) -> Result<PreviewRef, String> {
    let raw = uri.path().trim_start_matches('/');
    let decoded = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&decoded).map_err(|e| format!("Ungültige Vorschau-URL: {e}"))
}

async fn serve_preview(
    app: &AppHandle,
    request: Request<Vec<u8>>,
) -> Result<Response<Vec<u8>>, String> {
    let r = parse_preview_uri(request.uri())?;
    let client = s3::client_for(app, &r.s).await.map_err(|e| e.to_string())?;
    let (bytes, mime) = s3::fetch_object(&client, &r.b, &r.k)
        .await
        .map_err(|e| e.to_string())?;
    Response::builder()
        .header("Content-Type", mime)
        .header("Cache-Control", "no-store")
        .body(bytes)
        .map_err(|e| e.to_string())
}

/// Abbruch-Flag fuer die laufende Suche. Ein Scan ueber alle Buckets kann
/// lange dauern, deshalb muss er sich von aussen stoppen lassen.
#[derive(Default)]
struct SearchCancel(AtomicBool);

#[derive(Clone, Serialize)]
struct SearchProgress {
    bucket: String,
    scanned: u64,
    hits: usize,
}

#[derive(Serialize)]
struct UserTheme {
    file: String,
    content: String,
}

fn themes_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn user_themes_dir(app: AppHandle) -> Result<String, String> {
    Ok(themes_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
async fn list_user_themes(app: AppHandle) -> Result<Vec<UserTheme>, String> {
    let dir = themes_dir(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let is_yaml = matches!(
            path.extension().and_then(|e| e.to_str()),
            Some("yml") | Some("yaml")
        );
        if !is_yaml {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&path) {
            out.push(UserTheme {
                file: path.file_name().unwrap_or_default().to_string_lossy().into_owned(),
                content,
            });
        }
    }
    out.sort_by(|a, b| a.file.cmp(&b.file));
    Ok(out)
}

#[tauri::command]
async fn list_storages(app: AppHandle) -> Result<storages::StorageList, String> {
    storages::list(&app).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_storage(app: AppHandle, input: StorageInput) -> Result<Storage, String> {
    let saved = storages::save(&app, input).map_err(|e| e.to_string())?;
    // Endpunkt oder Zugangsdaten koennen sich geaendert haben.
    app.state::<s3::ClientCache>().invalidate(&saved.id);
    Ok(saved)
}

#[tauri::command]
async fn delete_storage(app: AppHandle, id: String) -> Result<(), String> {
    storages::delete(&app, &id).map_err(|e| e.to_string())?;
    app.state::<s3::ClientCache>().invalidate(&id);
    Ok(())
}

#[tauri::command]
async fn set_active_storage(app: AppHandle, id: String) -> Result<(), String> {
    storages::set_active(&app, &id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_connection(input: StorageInput) -> Result<Vec<String>, String> {
    let storage = Storage::from_input("test".into(), &input);
    let access = input.access_key.clone().unwrap_or_default();
    let secret = input.secret_key.clone().unwrap_or_default();
    let client = s3::client(&storage, &access, &secret).await;
    s3::list_buckets(&client).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_buckets(app: AppHandle, storage_id: String) -> Result<Vec<String>, String> {
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    s3::list_buckets(&client).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_objects(
    app: AppHandle,
    storage_id: String,
    bucket: String,
    prefix: String,
) -> Result<s3::Listing, String> {
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    s3::list_objects(&client, &bucket, &prefix)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn upload_file(
    app: AppHandle,
    storage_id: String,
    bucket: String,
    key: String,
    path: String,
) -> Result<(), String> {
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    s3::upload(&client, &bucket, &key, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_bucket(app: AppHandle, storage_id: String, name: String) -> Result<(), String> {
    let storage = storages::get(&app, &storage_id).map_err(|e| e.to_string())?;
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    s3::create_bucket(&client, &name, &storage.region)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_objects(
    app: AppHandle,
    state: State<'_, SearchCancel>,
    storage_id: String,
    buckets: Vec<String>,
    query: String,
    limit: usize,
) -> Result<s3::SearchResult, String> {
    state.0.store(false, Ordering::Relaxed);
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    let emitter = app.clone();
    s3::search(
        &client,
        &buckets,
        &query,
        limit,
        &state.0,
        move |bucket, scanned, hits| {
            let _ = emitter.emit(
                "search-progress",
                SearchProgress { bucket: bucket.to_string(), scanned, hits },
            );
        },
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_search(state: State<'_, SearchCancel>) {
    state.0.store(true, Ordering::Relaxed);
}

#[tauri::command]
async fn preview_object(
    app: AppHandle,
    storage_id: String,
    bucket: String,
    key: String,
) -> Result<s3::Preview, String> {
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    s3::preview(&client, &bucket, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_object(
    app: AppHandle,
    storage_id: String,
    bucket: String,
    key: String,
) -> Result<(), String> {
    let client = s3::client_for(&app, &storage_id).await.map_err(|e| e.to_string())?;
    s3::delete(&client, &bucket, &key)
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("preview", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let response = match serve_preview(&app, request).await {
                    Ok(r) => r,
                    Err(e) => Response::builder()
                        .status(404)
                        .header("Content-Type", "text/plain; charset=utf-8")
                        .body(e.into_bytes())
                        .expect("Fehlerantwort konnte nicht gebaut werden"),
                };
                responder.respond(response);
            });
        })
        .manage(SearchCancel::default())
        .manage(s3::ClientCache::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            list_storages,
            save_storage,
            delete_storage,
            set_active_storage,
            test_connection,
            list_buckets,
            list_objects,
            create_bucket,
            search_objects,
            cancel_search,
            upload_file,
            preview_object,
            delete_object,
            user_themes_dir,
            list_user_themes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
