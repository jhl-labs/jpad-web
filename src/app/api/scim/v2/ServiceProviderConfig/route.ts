import { NextRequest } from "next/server";
import { requireScimAuth, scimError, scimJson, ScimHttpError } from "@/lib/scim";

const SERVICE_PROVIDER_CONFIG_SCHEMA =
  "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";

export async function GET(req: NextRequest) {
  try {
    await requireScimAuth(req);

    return scimJson({
      schemas: [SERVICE_PROVIDER_CONFIG_SCHEMA],
      patch: {
        supported: true,
      },
      bulk: {
        supported: false,
        maxOperations: 0,
        maxPayloadSize: 0,
      },
      filter: {
        supported: true,
        maxResults: 200,
      },
      changePassword: {
        supported: false,
      },
      sort: {
        supported: false,
      },
      etag: {
        supported: false,
      },
      authenticationSchemes: [
        {
          type: "oauthbearertoken",
          name: "Organization SCIM Token",
          description: "Use an organization-scoped SCIM bearer token.",
          specUri: "https://www.rfc-editor.org/rfc/rfc6750",
          primary: true,
        },
      ],
    });
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    return scimError("Failed to read SCIM service provider configuration", 500);
  }
}
