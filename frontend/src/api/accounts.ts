export type ApiAccount = {
  id: string
  name: string
  type: string
  currency: string
  balance: number
}

export type GetAccountsResponse = {
  accounts: ApiAccount[]
}

export async function getAccounts(token: string): Promise<GetAccountsResponse> {
  const res = await fetch("https://babkin.onrender.com/api/v1/accounts", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to load accounts: ${res.status}`)
  }
  return res.json()
}
