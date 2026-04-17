import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key');
  const baseUrl = req.headers.get('x-base-url') || 'https://api.dify.ai/v1';

  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 401 });
  }

  const formData = await req.formData();

  const forwarded = new FormData();
  const file = formData.get('file') as File | null;
  const user = formData.get('user') as string | null;

  if (file) forwarded.append('file', file);
  if (user) forwarded.append('user', user);

  const response = await fetch(`${baseUrl}/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: forwarded,
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
