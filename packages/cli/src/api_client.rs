use anyhow::{Context, Result, bail};
use reqwest::StatusCode;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct LoginResponse {
    pub username_normalized: String,
    pub claimed: bool,
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateResponse {
    pub request_id: String,
}

#[derive(Debug, Deserialize)]
pub struct GetResponse {
    pub request_id: String,
    pub status: String,
    pub reply: Option<String>,
}

#[derive(Debug, Serialize)]
struct LoginRequest<'a> {
    username: &'a str,
}

#[derive(Debug, Serialize)]
struct CreateRequest<'a> {
    message: &'a str,
}

#[derive(Clone)]
pub struct ApiClient {
    base_url: String,
    client: Client,
}

impl ApiClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            client: Client::new(),
        }
    }

    pub fn login(&self, username: &str) -> Result<LoginResponse> {
        let response = self
            .client
            .post(format!("{}/cli/login", self.base_url))
            .json(&LoginRequest { username })
            .send()
            .context("login request failed")?;
        parse_json(response)
    }

    pub fn create_request(&self, token: &str, message: &str) -> Result<CreateResponse> {
        let response = self
            .client
            .post(format!("{}/cli/requests", self.base_url))
            .bearer_auth(token)
            .json(&CreateRequest { message })
            .send()
            .context("send request failed")?;
        parse_json(response)
    }

    pub fn get_request(
        &self,
        token: &str,
        request_id: &str,
        wait: bool,
        timeout_seconds: u64,
    ) -> Result<GetResponse> {
        let response = self
            .client
            .get(format!("{}/cli/requests/{}", self.base_url, request_id))
            .bearer_auth(token)
            .query(&[
                ("wait", wait.to_string()),
                ("timeout_seconds", timeout_seconds.to_string()),
            ])
            .send()
            .context("get request failed")?;
        parse_json(response)
    }
}

fn parse_json<T: for<'de> Deserialize<'de>>(response: reqwest::blocking::Response) -> Result<T> {
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED {
        bail!("authentication failed: invalid or missing credentials");
    }
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        bail!("api error {}: {}", status.as_u16(), body);
    }
    response.json::<T>().context("api returned invalid json")
}
