import { networkError } from "../../src/user-error.js";
const API = "https://api.rpforge.dev";
const messages = {
  INVALID_CREDENTIALS:
    "Confira o e-mail e a senha. Sua conta precisa ter o e-mail confirmado.",
  RATE_LIMITED:
    "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
  AUTH_LOCAL_ONLY: "A entrada por senha não está disponível neste ambiente.",
  PASSWORD_AUTH_UNAVAILABLE: "Use um dos provedores disponíveis para entrar.",
  MFA_INVALID:
    "Confira o código do autenticador ou use um código de recuperação.",
  INVALID_CHALLENGE: "Este acesso expirou. Entre novamente.",
  OAUTH_NOT_CONFIGURED: "Este provedor não está disponível no momento.",
};
export function createAuthClient(fetcher) {
  async function request(endpoint, body) {
    let response;
    try {
      response = await fetcher(API + endpoint, {
        method: body === undefined ? "GET" : "POST",
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: {
          Origin: "https://rpforge.dev",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw networkError(error);
    }
    const result =
      response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        messages[result.code] ||
          "Não foi possível concluir o acesso. Tente novamente.",
      );
    return result;
  }
  return {
    options: () => request("/v1/auth/providers"),
    async login(input) {
      if (
        !input ||
        typeof input.email !== "string" ||
        input.email.length > 254 ||
        typeof input.password !== "string" ||
        !input.password ||
        input.password.length > 128
      )
        throw new Error("Confira o e-mail e a senha.");
      const result = await request("/v1/auth/login", {
        email: input.email.trim(),
        password: input.password,
      });
      return result.mfaRequired && typeof result.challengeToken === "string"
        ? { mfaRequired: true, challengeToken: result.challengeToken }
        : { mfaRequired: false };
    },
    async verify(input) {
      if (
        !input ||
        typeof input.challengeToken !== "string" ||
        input.challengeToken.length > 512 ||
        typeof input.code !== "string" ||
        !/^(?:\d{6}|[a-f0-9]{32})$/.test(input.code)
      )
        throw new Error("Confira o código de verificação.");
      await request("/v1/auth/mfa/verify", {
        challengeToken: input.challengeToken,
        code: input.code,
      });
    },
  };
}
