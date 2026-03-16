import { NextRequest } from "next/server";
import {
  SCIM_LIST_RESPONSE_SCHEMA,
  requireScimAuth,
  scimError,
  scimJson,
  ScimHttpError,
} from "@/lib/scim";

const RESOURCE_TYPE_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ResourceType";
const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

export async function GET(req: NextRequest) {
  try {
    await requireScimAuth(req);
    const baseUrl = `${new URL(req.url).origin}/api/scim/v2`;

    const resources = [
      {
        schemas: [RESOURCE_TYPE_SCHEMA],
        id: "User",
        name: "User",
        endpoint: "/Users",
        description: "Provisioned organization users",
        schema: USER_SCHEMA,
        meta: {
          resourceType: "ResourceType",
          location: `${baseUrl}/ResourceTypes/User`,
        },
      },
      {
        schemas: [RESOURCE_TYPE_SCHEMA],
        id: "Group",
        name: "Group",
        endpoint: "/Groups",
        description: "Provisioned organization groups",
        schema: GROUP_SCHEMA,
        meta: {
          resourceType: "ResourceType",
          location: `${baseUrl}/ResourceTypes/Group`,
        },
      },
    ];

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

    return scimError("Failed to read SCIM resource types", 500);
  }
}
