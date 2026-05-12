use anyhow::Result;

use crate::config::clear_credentials;

pub fn run() -> Result<()> {
    if clear_credentials()? {
        println!("logged out");
    } else {
        println!("not logged in");
    }
    Ok(())
}
