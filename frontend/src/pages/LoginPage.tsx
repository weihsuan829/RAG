import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, ArrowLeft } from 'lucide-react';
import { login, setToken } from '../edu-rag/services/api';

const LoginPage = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // 傳統帳號密碼登入
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await login(email, password); // email 欄位當 username 用
            setToken(res.access_token);
            localStorage.setItem('display_name', res.display_name);
            navigate('/app/edu-rag/chat');
        } catch (err) {
            setError(err instanceof Error && err.message && err.message !== 'unauthorized' ? err.message : '帳號或密碼錯誤');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans relative">
            <button
                onClick={() => navigate('/')}
                className="absolute top-8 left-8 btn-ghost text-slate-500 hover:text-black dark:text-neutral-400 dark:hover:text-white flex items-center"
            >
                <ArrowLeft className="w-4 h-4 mr-2" /> 回首頁
            </button>

            <div className="bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-xl dark:shadow-2xl dark:shadow-black/50 w-full max-w-md p-8 sm:p-10 rounded-3xl animate-fadeIn relative overflow-hidden">
                {/* Top brand accent */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-blue-600"></div>

                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-5 rotate-3 shadow-sm border border-blue-100 dark:border-blue-800/50">
                        <Lock className="w-7 h-7 -rotate-3" />
                    </div>
                    <h2 className="text-2xl font-bold text-black dark:text-white tracking-tight">系統登入</h2>
                    <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2">使用預設管理員憑證以登入系統</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-black dark:text-white uppercase tracking-wider text-[11px]">
                            帳號
                        </label>
                        <div className="relative group">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-neutral-500 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                autoComplete="username"
                                required
                                placeholder="請輸入帳號"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-black dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 font-medium"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-black dark:text-white uppercase tracking-wider text-[11px] flex justify-between">
                            <span>密碼</span>
                            <a href="#" className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 normal-case tracking-normal">忘記密碼？</a>
                        </label>
                        <div className="relative group">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-neutral-500 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="password"
                                required
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-black dark:text-white placeholder-slate-400 dark:placeholder-neutral-600 font-medium tracking-widest"
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary py-3.5 flex justify-center items-center font-bold disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 relative overflow-hidden group rounded-xl"
                        >
                            {loading ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                <>
                                    <span className="relative z-10 text-white">登入系統</span>
                                    <ArrowRight className="w-5 h-5 ml-2 relative z-10 text-white group-hover:translate-x-1 transition-transform" />
                                    <div className="absolute inset-0 bg-blue-600 transform scale-x-0 origin-left group-hover:scale-x-100 transition-transform duration-300"></div>
                                </>
                            )}
                        </button>
                    </div>
                </form>
                {error && <p className="text-sm text-red-500 text-center mt-3">{error}</p>}
            </div>

            <p className="mt-8 text-xs text-slate-400 dark:text-neutral-600 text-center">
                新北市教育局 RAG 檢索系統
            </p>
        </div>
    );
};

export default LoginPage;
