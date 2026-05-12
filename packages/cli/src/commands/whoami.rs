use anyhow::Result;

use crate::config::load_credentials;

pub fn run() -> Result<()> {
    let credentials = load_credentials()?;
    println!("{}", credentials.username_normalized);
    Ok(())
}
