export type Role = "user" | "admin";

export type TemplateRecord = {
  id: string;
  name: string;
  content: string;
  builtin: boolean;
  updatedAt?: string;
};

export type SubscriptionInput = {
  prefix: string;
  url: string;
};

export type GenerateInput = {
  templateId?: string;
  templateContent?: string;
  nodeInput?: string;
  uris?: string;
  subscriptions: SubscriptionInput[];
};

export type Env = {
  TEMPLATE_KV?: KVNamespace;
  ACCESS_PASSWORD?: string;
  ADMIN_PASSWORD?: string;
  TOKEN_SECRET?: string;
};
