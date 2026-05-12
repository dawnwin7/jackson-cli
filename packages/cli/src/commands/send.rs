use anyhow::Result;

use crate::api_client::ApiClient;
use crate::config::load_credentials;

pub fn run(message: &str) -> Result<()> {
    let credentials = load_credentials()?;
    let response =
        ApiClient::new(&credentials.api_base_url).create_request(&credentials.token, message)?;
    println!("request_id: {}", response.request_id);
    Ok(())
}
