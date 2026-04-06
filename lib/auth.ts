import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabase } from './supabase'
import { JWT } from 'next-auth/jwt'

const getAdminEmails = (): string[] => {
  const adminEmails = process.env.ADMIN_EMAILS || ''
  return adminEmails.split(',').map(email => email.trim().toLowerCase())
}

async function getAdminEmailsFromDb(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('account_roles')
      .select('email')
      .eq('role', 'admin')
    return (data || []).map((r: { email: string }) => r.email.trim().toLowerCase())
  } catch {
    return []
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    const newExpiresAt = Date.now() + (refreshedTokens.expires_in ?? 3500) * 1000

    if (token.sub && token.email) {
      try {
        await supabase
          .from('user_tokens')
          .upsert({
            user_id: token.sub,
            email: token.email,
            access_token: refreshedTokens.access_token,
            refresh_token: refreshedTokens.refresh_token ?? token.refreshToken,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id'
          })
      } catch (error) {
        console.error('Failed to update user token in Supabase:', error)
      }
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      accessTokenExpires: newExpiresAt,
    }
  } catch (error) {
    console.error('Failed to refresh access token:', error)
    return token
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 90 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 90 * 24 * 60 * 60,
  },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 90 * 24 * 60 * 60,
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.accessTokenExpires = Date.now() + ((account.expires_in as number) ?? 3500) * 1000
        
        if (token.email && account.access_token && account.refresh_token) {
          try {
            await supabase
              .from('user_tokens')
              .upsert({
                user_id: token.sub,
                email: token.email,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'user_id'
              })
          } catch (error) {
            console.error('Failed to save user token:', error)
          }
        }
      }

      const expiresAt = token.accessTokenExpires as number | undefined
      const shouldRefresh = expiresAt && Date.now() > expiresAt - 5 * 60 * 1000

      if (shouldRefresh && token.refreshToken) {
        return refreshAccessToken(token)
      }

      if (token.email) {
        const envAdmins = getAdminEmails()
        const dbAdmins = await getAdminEmailsFromDb()
        const allAdmins = [...new Set([...envAdmins, ...dbAdmins])]
        token.isAdmin = allAdmins.includes(token.email.toLowerCase())
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.user = {
        ...session.user,
        id: token.sub as string,
        isAdmin: token.isAdmin as boolean,
      }
      return session
    },
  },
}