const isAllowedProbeUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('drive.google.com') || host.endsWith('docs.google.com');
  } catch {
    return false;
  }
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const rawUrl = String(req.query?.url ?? '').trim();
  if (!rawUrl || !isAllowedProbeUrl(rawUrl)) {
    return res.status(400).json({ ok: false, error: 'Invalid preview URL' });
  }

  try {
    const response = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'DMERCH-Preview-Probe/1.0',
      },
    });

    const body = await response.text();
    const lower = body.toLowerCase();
    const looksForbidden =
      response.status === 401 ||
      response.status === 403 ||
      lower.includes("403. that’s an error") ||
      lower.includes("you do not have access to this page");

    return res.status(200).json({
      ok: true,
      previewable: !looksForbidden,
      statusCode: response.status,
    });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      previewable: false,
      error: error instanceof Error ? error.message : 'Preview probe failed',
    });
  }
}
