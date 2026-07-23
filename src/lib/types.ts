export type Role = "user" | "admin";

export type TemplateMeta = {
  id: string;
  name: string;
  builtin: boolean;
  updatedAt?: string;
};

export type TemplateRecord = TemplateMeta & {
  content: string;
};

export type SubscriptionInput = {
  prefix: string;
  url: string;
};
