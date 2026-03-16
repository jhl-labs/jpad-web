import { NextRequest } from "next/server";
import {
  SCIM_CORE_GROUP_SCHEMA,
  SCIM_CORE_USER_SCHEMA,
  SCIM_LIST_RESPONSE_SCHEMA,
  requireScimAuth,
  scimError,
  scimJson,
  ScimHttpError,
} from "@/lib/scim";

const SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema";

function buildUserSchema(baseUrl: string) {
  return {
    schemas: [SCHEMA_SCHEMA],
    id: SCIM_CORE_USER_SCHEMA,
    name: "User",
    description: "Organization-scoped SCIM user",
    attributes: [
      {
        name: "userName",
        type: "string",
        multiValued: false,
        required: true,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
        uniqueness: "server",
      },
      {
        name: "externalId",
        type: "string",
        multiValued: false,
        required: false,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
        uniqueness: "server",
      },
      {
        name: "displayName",
        type: "string",
        multiValued: false,
        required: false,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
      },
      {
        name: "active",
        type: "boolean",
        multiValued: false,
        required: false,
        mutability: "readWrite",
        returned: "default",
      },
      {
        name: "name",
        type: "complex",
        multiValued: false,
        required: false,
        subAttributes: [
          {
            name: "givenName",
            type: "string",
            multiValued: false,
            required: false,
            caseExact: false,
            mutability: "readWrite",
            returned: "default",
          },
          {
            name: "familyName",
            type: "string",
            multiValued: false,
            required: false,
            caseExact: false,
            mutability: "readWrite",
            returned: "default",
          },
        ],
      },
      {
        name: "emails",
        type: "complex",
        multiValued: true,
        required: false,
        subAttributes: [
          {
            name: "value",
            type: "string",
            multiValued: false,
            required: true,
            caseExact: false,
            mutability: "readWrite",
            returned: "default",
          },
          {
            name: "primary",
            type: "boolean",
            multiValued: false,
            required: false,
            mutability: "readWrite",
            returned: "default",
          },
        ],
      },
    ],
    meta: {
      resourceType: "Schema",
      location: `${baseUrl}/Schemas/${encodeURIComponent(SCIM_CORE_USER_SCHEMA)}`,
    },
  };
}

function buildGroupSchema(baseUrl: string) {
  return {
    schemas: [SCHEMA_SCHEMA],
    id: SCIM_CORE_GROUP_SCHEMA,
    name: "Group",
    description: "Organization-scoped SCIM group",
    attributes: [
      {
        name: "displayName",
        type: "string",
        multiValued: false,
        required: true,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
        uniqueness: "server",
      },
      {
        name: "externalId",
        type: "string",
        multiValued: false,
        required: false,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
        uniqueness: "server",
      },
      {
        name: "members",
        type: "complex",
        multiValued: true,
        required: false,
        mutability: "readWrite",
        subAttributes: [
          {
            name: "value",
            type: "string",
            multiValued: false,
            required: true,
            caseExact: true,
            mutability: "readWrite",
            returned: "default",
          },
        ],
      },
    ],
    meta: {
      resourceType: "Schema",
      location: `${baseUrl}/Schemas/${encodeURIComponent(SCIM_CORE_GROUP_SCHEMA)}`,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireScimAuth(req);
    const baseUrl = `${new URL(req.url).origin}/api/scim/v2`;
    const resources = [buildUserSchema(baseUrl), buildGroupSchema(baseUrl)];

    return scimJson({
      schemas: [SCIM_LIST_RESPONSE_SCHEMA],
      totalResults: resources.length,
      startIndex: 1,
      itemsPerPage: resources.length,
      Resources: resources,
    });
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    return scimError("Failed to read SCIM schemas", 500);
  }
}

export { buildUserSchema, buildGroupSchema };
