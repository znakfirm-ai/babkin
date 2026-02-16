export type CategoryDto = {
  id: string
  name: string
  kind: "income" | "expense"
  icon: string | null
}

export type GetCategoriesResponse = {
  categories: CategoryDto[]
}

export async function getCategories(token: string): Promise<GetCategoriesResponse> {
  const res = await fetch("https://babkin.onrender.com/api/v1/categories", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`GET /categories failed: ${res.status} ${res.statusText} ${text}`)
  }
  return res.json()
}

export type CreateCategoryBody = {
  name: string
  kind: "income" | "expense"
  icon?: string | null
}

export async function createCategory(token: string, body: CreateCategoryBody): Promise<CategoryDto> {
  const res = await fetch("https://babkin.onrender.com/api/v1/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Failed to create category: ${res.status}`)
  }
  const data = (await res.json()) as { category: CategoryDto }
  return data.category
}

export async function renameCategory(token: string, id: string, name: string): Promise<CategoryDto> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/categories/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`PATCH /categories failed: ${res.status} ${res.statusText} ${text}`)
  }
  const data = (await res.json()) as { category: CategoryDto }
  return data.category
}

export async function deleteCategory(token: string, id: string): Promise<void> {
  const res = await fetch(`https://babkin.onrender.com/api/v1/categories/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`DELETE /categories failed: ${res.status} ${res.statusText} ${text}`)
  }
}
