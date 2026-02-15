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

export type CreateAccountBody = {
  name: string
  type: string
  currency: string
  balance?: number
}

export async function createAccount(token: string, body: CreateAccountBody): Promise<ApiAccount> {
  const res = await fetch("https://babkin.onrender.com/api/v1/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Failed to create account: ${res.status}`)
  }
  const data = (await res.json()) as { account: ApiAccount }
  return data.account
}
