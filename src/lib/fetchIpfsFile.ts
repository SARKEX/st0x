export type RetrieveResponse = {
  data: string | number[];
  contentType: string;
  message?: string;
};

export async function fetchIpfsFile(cid: string): Promise<RetrieveResponse> {
  const res = await fetch('/pinata/retrieve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to retrieve file');
  }
  return data as RetrieveResponse;
}

