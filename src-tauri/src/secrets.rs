use keyring::Entry;

use crate::error::AppResult;

const SERVICE: &str = "com.ghostwriter.app";
const ACCOUNT: &str = "gemini-api-key";

fn entry() -> AppResult<Entry> {
    Ok(Entry::new(SERVICE, ACCOUNT)?)
}

pub fn get_key() -> AppResult<Option<String>> {
    let e = entry()?;
    match e.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.into()),
    }
}

pub fn set_key(value: &str) -> AppResult<()> {
    let e = entry()?;
    e.set_password(value)?;
    Ok(())
}

pub fn delete_key() -> AppResult<()> {
    let e = entry()?;
    match e.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.into()),
    }
}
