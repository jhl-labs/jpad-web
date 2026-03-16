import { NextRequest } from "next/server";
import { buildGroupSchema, buildUserSchema } from "@/app/api/scim/v2/Schemas/route";
import {
  SCIM_CORE_GROUP_SCHEMA,
  SCIM_CORE_USER_SCHEMA,
  requireScimAuth,
  scimError,
  scimJson,
  ScimHttpError,
} from "@/lib/scim";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ schemaId: string }> }
) {
  try {
    await requireScimAuth(req);
    const { schemaId } = await params;
    const decodedSchemaId = decodeURIComponent(schemaId);
    const baseUrl = `${new URL(req.url).origin}/api/scim/v2`;

    if (decodedSchemaId === SCIM_CORE_USER_SCHEMA) {
      return scimJson(buildUserSchema(baseUrl));
    }

    if (decodedSchemaId === SCIM_CORE_GROUP_SCHEMA) {
      return scimJson(buildGroupSchema(baseUrl));
    }

    return scimError("SCIM schema not found", 404);
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    return scimError("Failed to read SCIM schema", 500);
  }
}
