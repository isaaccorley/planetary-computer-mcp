/**
 * Geospatial utility functions
 */

/**
 * Extract storage account from asset metadata
 */
export function extractStorageAccountFromAsset(asset?: Record<string, any>): string | undefined {
  if (!asset) return undefined;
  const storageOptions = asset["xarray:storage_options"];
  if (storageOptions && typeof storageOptions === "object") {
    if (typeof storageOptions.account_name === "string") {
      return storageOptions.account_name;
    }
    if (typeof storageOptions.accountName === "string") {
      return storageOptions.accountName;
    }
  }
  if (typeof asset["msft:storage_account"] === "string") {
    return asset["msft:storage_account"];
  }
  const openKwargs = asset["xarray:open_kwargs"];
  if (openKwargs && typeof openKwargs === "object") {
    const nestedStorage = (openKwargs as Record<string, any>)["storage_options"];
    if (nestedStorage && typeof nestedStorage === "object") {
      if (typeof nestedStorage.account_name === "string") {
        return nestedStorage.account_name;
      }
      if (typeof nestedStorage.accountName === "string") {
        return nestedStorage.accountName;
      }
    }
  }
  return undefined;
}

/**
 * Convert ABFS URL to HTTPS URL
 */
export function convertAbfsToHttps(href: string, storageAccount?: string): string {
  if (!href.startsWith("abfs://")) return href;
  const withAccount = href.match(/^abfs:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (withAccount) {
    const [, container, accountHost, rest] = withAccount;
    const httpsHost = accountHost.replace(".dfs.", ".blob.");
    return `https://${httpsHost}/${container}/${rest}`;
  }
  if (storageAccount) {
    const withoutAccount = href.match(/^abfs:\/\/([^/]+)\/(.+)$/);
    if (withoutAccount) {
      const [, container, rest] = withoutAccount;
      return `https://${storageAccount}.blob.core.windows.net/${container}/${rest}`;
    }
  }
  return href;
}
