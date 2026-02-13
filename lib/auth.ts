import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabase } from './supabase'

// 運営のメールアドレスリスト（環境変数）
const getAdminEmails = (): string[] => {
  const adminEmails = process.env.ADMIN_EMAILS || ''
  return adminEmails.split(',').map(email => email.trim().toLowerCase())
}

// 運営のメールアドレスリスト（DB: account_roles）
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

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // カレンダーの読み書き権限を追加
          scope: 'openid email profile https://www.googleapis.com/auth/calendar',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 90 * 24 * 60 * 60, // 90日間（ログイン状態を維持）
  },
  jwt: {
    maxAge: 90 * 24 * 60 * 60, // 90日間
  },
  // セッションクッキーを明示的に永続化（ブラウザを閉じてもログイン維持）
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
        maxAge: 90 * 24 * 60 * 60, // 90日（秒）
      },
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // 初回ログイン時にアクセストークンを保存
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        
        // トークンをSupabaseに保存（講師のカレンダーに予定を追加するため）
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
      // メールアドレスから運営かどうかを判定（環境変数 + account_roles）
      if (token.email) {
        const envAdmins = getAdminEmails()
        const dbAdmins = await getAdminEmailsFromDb()
        const allAdmins = [...new Set([...envAdmins, ...dbAdmins])]
        token.isAdmin = allAdmins.includes(token.email.toLowerCase())
      }
      return token
    },
    async session({ session, token }) {
      // セッションにアクセストークンとユーザー情報を追加
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
