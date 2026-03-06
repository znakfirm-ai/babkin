export type SharedWorkspaceAccessDecision = {
  allowed: boolean
  reason?: "shared_feature_disabled"
}

export const canUseSharedWorkspaceFeature = (): SharedWorkspaceAccessDecision => {
  if (process.env.SHARED_WORKSPACE_ENABLED === "0") {
    return { allowed: false, reason: "shared_feature_disabled" }
  }
  return { allowed: true }
}
