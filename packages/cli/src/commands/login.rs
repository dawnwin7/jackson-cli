use anyhow::{Result, bail};
use std::io::{self, Write};

use crate::api_client::ApiClient;
use crate::config::{Credentials, api_base_url, save_credentials};

pub fn run(username: Option<String>) -> Result<()> {
    let username = match username {
        Some(value) if !value.trim().is_empty() => value,
        _ => prompt_username()?,
    };
    let base_url = api_base_url();
    let response = ApiClient::new(&base_url).login(&username)?;
    if !response.claimed {
        bail!("username already claimed; the original token cannot be shown again");
    }
    let token = response
        .token
        .ok_or_else(|| anyhow::anyhow!("api did not return a first-claim token"))?;
    save_credentials(&Credentials {
        username_normalized: response.username_normalized.clone(),
        token,
        api_base_url: base_url,
    })?;
    println!("logged in as {}", response.username_normalized);
    Ok(())
}

fn prompt_username() -> Result<String> {
    print!("username: ");
    io::stdout().flush()?;
    let mut username = String::new();
    io::stdin().read_line(&mut username)?;
    let username = username.trim().to_string();
    if username.is_empty() {
        bail!("username is required");
    }
    Ok(username)
}
