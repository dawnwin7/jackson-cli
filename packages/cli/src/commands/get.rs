use anyhow::Result;

use crate::api_client::ApiClient;
use crate::config::load_credentials;

pub fn run(request_id: &str, wait: bool, timeout_seconds: u64) -> Result<()> {
    let credentials = load_credentials()?;
    let response = ApiClient::new(&credentials.api_base_url).get_request(
        &credentials.token,
        request_id,
        wait,
        timeout_seconds,
    )?;
    match response.reply {
        Some(reply) => println!("{}", reply),
        None => println!("{}: {}", response.request_id, response.status),
    }
    Ok(())
}
