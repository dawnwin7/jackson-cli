use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub username_normalized: String,
    pub token: String,
    pub api_base_url: String,
}

pub fn api_base_url() -> String {
    std::env::var("JACKSON_API_BASE_URL")
        .unwrap_or_else(|_| "https://jackson-api.fastapicloud.dev".to_string())
}

pub fn credentials_path() -> Result<PathBuf> {
    if let Ok(home) = std::env::var("JACKSON_CONFIG_HOME") {
        return Ok(PathBuf::from(home).join("jackson").join("credentials.json"));
    }
    let home = dirs::home_dir().context("could not determine platform home directory")?;
    Ok(default_credentials_path(home))
}

fn default_credentials_path(home: PathBuf) -> PathBuf {
    home.join(".jackson").join("credentials.json")
}

pub fn save_credentials(credentials: &Credentials) -> Result<PathBuf> {
    let path = credentials_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("could not create {}", parent.display()))?;
    }
    let data = serde_json::to_vec_pretty(credentials)?;
    fs::write(&path, data).with_context(|| format!("could not write {}", path.display()))?;
    set_owner_only(&path)?;
    Ok(path)
}

pub fn load_credentials() -> Result<Credentials> {
    let path = credentials_path()?;
    if !path.exists() {
        bail!("login required: run `jackson login` first");
    }
    let data = fs::read(&path).with_context(|| format!("could not read {}", path.display()))?;
    serde_json::from_slice(&data)
        .with_context(|| format!("invalid credentials file at {}", path.display()))
}

pub fn clear_credentials() -> Result<bool> {
    let path = credentials_path()?;
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_file(&path).with_context(|| format!("could not remove {}", path.display()))?;
    Ok(true)
}

pub fn redact(value: &str) -> String {
    if value.len() <= 8 {
        "<redacted>".to_string()
    } else {
        format!("{}…{}", &value[..4], &value[value.len() - 4..])
    }
}

#[cfg(unix)]
fn set_owner_only(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_owner_only(_path: &PathBuf) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::default_credentials_path;
    use std::path::PathBuf;

    #[test]
    fn default_credentials_path_uses_hidden_jackson_dir_in_home() {
        assert_eq!(
            default_credentials_path(PathBuf::from("/Users/jackson")),
            PathBuf::from("/Users/jackson/.jackson/credentials.json")
        );
    }
}
