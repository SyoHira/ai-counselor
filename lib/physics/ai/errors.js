/** 接続先から返ったエラー。本文は利用者へ見せず、状態コードだけで扱う。 */
export class ProviderError extends Error {
  constructor(status, provider) {
    super(`provider ${provider} returned ${status}`);
    this.status = status;
    this.provider = provider;
  }
}
