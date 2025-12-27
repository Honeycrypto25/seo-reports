import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export async function getGSCPerformance(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string
) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const searchConsole = google.webmasters({ version: "v3", auth });

    try {
        const response = await searchConsole.searchanalytics.query({
            siteUrl,
            requestBody: {
                startDate,
                endDate,
                dimensions: ["date"],
                rowLimit: 31,
            },
        });

        return response.data.rows || [];
    } catch (error) {
        console.error("Error fetching GSC data:", error);
        throw error;
    }
}
