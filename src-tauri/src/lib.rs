use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct ProxyResponse {
    pub content: String,
    pub url: String,
    pub status: u16,
}

pub async fn fetch_url_impl(url: String, client: &reqwest::Client) -> Result<ProxyResponse, String> {
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    
    let status = response.status().as_u16();
    let final_url = response.url().to_string();
    let content = response.text().await.map_err(|e| e.to_string())?;
    
    Ok(ProxyResponse {
        content,
        url: final_url,
        status,
    })
}

#[tauri::command]
async fn fetch_url(url: String) -> Result<ProxyResponse, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;
    
    fetch_url_impl(url, &client).await
}

pub fn validate_url(url: &str) -> Result<(), String> {
    if url.is_empty() {
        return Err("URL cannot be empty".to_string());
    }
    
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }
    
    url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<(), String> {
    validate_url(&url)?;
    tauri_plugin_opener::open_url(&url, None::<String>)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_url,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn test_validate_url_valid() {
        assert!(validate_url("https://www.google.com").is_ok());
        assert!(validate_url("http://localhost:3000").is_ok());
    }

    #[tokio::test]
    async fn test_validate_url_invalid() {
        assert!(validate_url("").is_err());
        assert!(validate_url("not-a-url").is_err());
        assert!(validate_url("ftp://example.com").is_err());
    }

    #[tokio::test]
    async fn test_fetch_url_success() {
        let mock_server = MockServer::start().await;
        
        Mock::given(method("GET"))
            .and(path("/test"))
            .respond_with(ResponseTemplate::new(200).set_body_string("<html><body>Test Content</body></html>"))
            .mount(&mock_server)
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/test", &mock_server.uri());
        
        let result = fetch_url_impl(url.clone(), &client).await;
        
        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.content, "<html><body>Test Content</body></html>");
        assert_eq!(response.url, url);
    }

    #[tokio::test]
    async fn test_fetch_url_404() {
        let mock_server = MockServer::start().await;
        
        Mock::given(method("GET"))
            .and(path("/not-found"))
            .respond_with(ResponseTemplate::new(404).set_body_string("Not Found"))
            .mount(&mock_server)
            .await;

        let client = reqwest::Client::new();
        let url = format!("{}/not-found", &mock_server.uri());
        
        let result = fetch_url_impl(url.clone(), &client).await;
        
        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status, 404);
        assert_eq!(response.content, "Not Found");
    }

    #[tokio::test]
    async fn test_fetch_url_invalid_url() {
        let client = reqwest::Client::new();
        let result = fetch_url_impl("invalid-url".to_string(), &client).await;
        assert!(result.is_err());
    }
}
