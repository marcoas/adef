/**
 * Verificación del login con Google (Google Identity Services, token client).
 *
 * El frontend obtiene un access token de Google y lo envía al backend. Antes
 * de confiar en la identidad se valida contra Google que:
 *   1. el token sea válido y no esté vencido (endpoint tokeninfo),
 *   2. haya sido emitido para NUESTRO client id (aud / azp), evitando que se
 *      reutilicen tokens de otras aplicaciones,
 *   3. el email esté verificado.
 * Recién entonces se lee el perfil (nombre y foto) desde userinfo.
 */

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export interface GoogleProfile {
  email: string;
  name: string;
  picture?: string;
}

/**
 * Devuelve el perfil verificado del dueño del access token, o `null` si el
 * token es inválido, pertenece a otra aplicación o el email no está verificado.
 * Lanza solo ante errores de red al contactar a Google.
 */
export async function verifyGoogleAccessToken(
  accessToken: string,
  clientId: string,
): Promise<GoogleProfile | null> {
  const infoRes = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`);
  if (!infoRes.ok) return null;

  const info = (await infoRes.json()) as {
    aud?: string;
    azp?: string;
    email?: string;
    email_verified?: string | boolean;
  };
  if (info.aud !== clientId && info.azp !== clientId) return null;
  if (!info.email || String(info.email_verified) !== 'true') return null;

  // El perfil es complementario: si falla se usa el email como nombre
  let profile: { name?: string; picture?: string } = {};
  try {
    const profileRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (profileRes.ok) profile = (await profileRes.json()) as typeof profile;
  } catch (err) {
    console.warn('No se pudo obtener el perfil de Google:', err);
  }

  return {
    email: info.email,
    name: profile.name || info.email.split('@')[0],
    picture: profile.picture,
  };
}
