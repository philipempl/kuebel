use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "storages.json";
const CREDS_KEY: &str = "credentials";

/// Access- und Secret-Key eines Storages. Liegt im Klartext in storages.json im
/// App-Data-Ordner - bewusste Entscheidung gegen den System-Schluesselbund, weil
/// macOS sonst bei jedem Zugriff einen Dialog zeigt. Siehe README.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Secret {
    pub access_key: String,
    pub secret_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Storage {
    pub id: String,
    pub name: String,
    pub endpoint: String,
    pub region: String,
    pub path_style: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StorageInput {
    pub id: Option<String>,
    pub name: String,
    pub endpoint: String,
    pub region: String,
    pub path_style: bool,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageList {
    pub storages: Vec<Storage>,
    pub active_id: Option<String>,
}

impl Storage {
    pub fn from_input(id: String, input: &StorageInput) -> Self {
        Storage {
            id,
            name: input.name.trim().to_string(),
            endpoint: input.endpoint.trim().trim_end_matches('/').to_string(),
            region: input.region.trim().to_string(),
            path_style: input.path_style,
        }
    }
}

fn read_creds(app: &AppHandle) -> Result<HashMap<String, Secret>, Box<dyn std::error::Error>> {
    let store = app.store(STORE_FILE)?;
    Ok(store
        .get(CREDS_KEY)
        .map(|v| serde_json::from_value(v).unwrap_or_default())
        .unwrap_or_default())
}

fn write_creds(
    app: &AppHandle,
    creds: &HashMap<String, Secret>,
) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store(STORE_FILE)?;
    store.set(CREDS_KEY, serde_json::to_value(creds)?);
    store.save()?;
    Ok(())
}

fn read_all(app: &AppHandle) -> Result<(Vec<Storage>, Option<String>), Box<dyn std::error::Error>> {
    let store = app.store(STORE_FILE)?;
    let storages: Vec<Storage> = store
        .get("storages")
        .map(|v| serde_json::from_value(v).unwrap_or_default())
        .unwrap_or_default();
    let active: Option<String> = store
        .get("active_id")
        .and_then(|v| v.as_str().map(|s| s.to_string()));
    Ok((storages, active))
}

fn write_all(
    app: &AppHandle,
    storages: &[Storage],
    active: &Option<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.store(STORE_FILE)?;
    store.set("storages", serde_json::to_value(storages)?);
    store.set("active_id", serde_json::to_value(active)?);
    store.save()?;
    Ok(())
}

pub fn list(app: &AppHandle) -> Result<StorageList, Box<dyn std::error::Error>> {
    let (storages, active_id) = read_all(app)?;
    Ok(StorageList { storages, active_id })
}

pub fn save(app: &AppHandle, input: StorageInput) -> Result<Storage, Box<dyn std::error::Error>> {
    let (mut storages, mut active) = read_all(app)?;
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let storage = Storage::from_input(id.clone(), &input);

    let mut creds = read_creds(app)?;
    let entry = creds.entry(id.clone()).or_default();
    // Leere Felder bedeuten "unveraendert lassen" - das Formular zeigt
    // gespeicherte Secrets nicht an.
    if let Some(ak) = input.access_key.as_deref() {
        if !ak.is_empty() {
            entry.access_key = ak.to_string();
        }
    }
    if let Some(sk) = input.secret_key.as_deref() {
        if !sk.is_empty() {
            entry.secret_key = sk.to_string();
        }
    }
    write_creds(app, &creds)?;

    match storages.iter_mut().find(|s| s.id == id) {
        Some(existing) => *existing = storage.clone(),
        None => storages.push(storage.clone()),
    }
    if active.is_none() {
        active = Some(id);
    }
    write_all(app, &storages, &active)?;
    Ok(storage)
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let (mut storages, mut active) = read_all(app)?;
    storages.retain(|s| s.id != id);
    if active.as_deref() == Some(id) {
        active = storages.first().map(|s| s.id.clone());
    }
    let mut creds = read_creds(app)?;
    creds.remove(id);
    write_creds(app, &creds)?;
    write_all(app, &storages, &active)
}

pub fn set_active(app: &AppHandle, id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let (storages, _) = read_all(app)?;
    if !storages.iter().any(|s| s.id == id) {
        return Err("Storage nicht gefunden".into());
    }
    write_all(app, &storages, &Some(id.to_string()))
}

pub fn get(app: &AppHandle, id: &str) -> Result<Storage, Box<dyn std::error::Error>> {
    let (storages, _) = read_all(app)?;
    storages
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| "Storage nicht gefunden".into())
}

const MISSING_CREDS: &str =
    "Zugangsdaten fehlen. Bitte den Storage bearbeiten und Access Key und Secret Key eintragen.";

pub fn credentials(app: &AppHandle, id: &str) -> Result<(String, String), Box<dyn std::error::Error>> {
    let creds = read_creds(app)?;
    match creds.get(id) {
        Some(c) if !c.access_key.is_empty() && !c.secret_key.is_empty() => {
            Ok((c.access_key.clone(), c.secret_key.clone()))
        }
        _ => Err(MISSING_CREDS.into()),
    }
}
