const { z } = require("zod");

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(100),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(100),
});

const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(""),
  memberIds: z.array(z.number().int().positive()).default([]),
});

const taskSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).default("TODO"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dueDate: z.union([z.iso.datetime(), z.literal(""), z.null()]).default(""),
  assignedTo: z.union([z.number().int().positive(), z.null()]).default(null),
});

function validate(schema, payload) {
  const result = schema.safeParse(payload);

  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => issue.message),
    };
  }

  return { ok: true, data: result.data };
}

module.exports = {
  signupSchema,
  loginSchema,
  projectSchema,
  taskSchema,
  validate,
};
