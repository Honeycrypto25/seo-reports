import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope: "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email",
                    access_type: "offline",
                    prompt: "consent",
                },
            },
        }),
    ],
    callbacks: {
        async signIn({ user }) {
            const allowedEmails = process.env.ALLOWED_EMAILS?.split(",") || [];
            // If no allowed emails are configured, we allow everyone (default behavior for testing locally)
            // BUT for your security, we will make it stricter:
            if (allowedEmails.length > 0 && user.email) {
                const isAllowed = allowedEmails.some(email => email.trim().toLowerCase() === user.email?.toLowerCase());
                return isAllowed;
            }
            return true; // Change this to false if you want to block everyone by default when no list is set
        },
        async jwt({ token, account }) {
            // Persist the OAuth access_token to the token right after signin
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token; // Optional: if you need to refresh tokens
                token.expiresAt = account.expires_at;
            }
            return token;
        },
        async session({ session, token }) {
            // Send properties to the client, like an access_token from a provider.
            // Note: We normally don't expose access tokens to the client side for security, 
            // but for this MVP we might need it for client-side fetches or just keep it server-side.
            // A better pattern is to keep the token in the JWT/Session on the server 
            // and use Next.js API routes as a proxy.

            // @ts-ignore // We'll need to extend the session type later
            session.accessToken = token.accessToken;
            return session;
        },
    },
    session: {
        strategy: "jwt",
    },
    pages: {
        signIn: "/auth/signin",
    },
    debug: process.env.NODE_ENV === "development",
};
