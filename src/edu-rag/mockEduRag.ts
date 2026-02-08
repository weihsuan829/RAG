// Mock data and types for the Education RAG demo UI.
export interface Thread {
    id: string;
    title: string;
    updatedAt: string;
    preview: string;
}

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    citations?: Citation[];
}

export interface Citation {
    id: string;
    docName: string;
    page?: number;
    snippet: string;
    similarity: number;
}

export interface Doc {
    id: string;
    name: string;
    type: 'pdf' | 'docx' | 'txt';
    year: string;
    status: 'indexed' | 'processing' | 'error';
    updatedAt: string;
    tags: string[];
}

// Sample thread list.
export const MOCK_THREADS: Thread[] = [
    { id: 't1', title: '雙語教育政策查詢', updatedAt: '2024-05-20T10:30:00', preview: '關於最新的雙語教育實施計畫...' },
    { id: 't2', title: '特教補助申請流程', updatedAt: '2024-05-19T14:20:00', preview: '請問特教助理員的申請資格...' },
    { id: 't3', title: '校園防疫規範', updatedAt: '2024-05-18T09:15:00', preview: '目前的流感停課標準是什麼？' },
];

// Sample chat messages by thread id.
export const MOCK_MESSAGES: Record<string, Message[]> = {
    't1': [
        { id: 'm1', role: 'user', content: '請問 113 學年度雙語教育的重點學校有哪些？', timestamp: '10:30' },
        {
            id: 'm2',
            role: 'assistant',
            content: '根據 113 學年度雙語教育實施計畫，重點學校包含...\n\n1. 中山國小\n2. 中正國中\n\n詳細名單請參考附件。',
            timestamp: '10:31',
            citations: [
                { id: 'c1', docName: '113學年度雙語教育實施計畫.pdf', page: 3, snippet: '...核定重點學校共 30 所，名單如下...', similarity: 0.92 },
                { id: 'c2', docName: '雙語教學指引v2.docx', page: 12, snippet: '...重點學校需每週實施 1/3 以上雙語課程...', similarity: 0.85 }
            ]
        }
    ],
    't2': [],
    't3': []
};

// Sample document inventory.
export const MOCK_DOCS: Doc[] = [
    { id: 'd1', name: '113學年度雙語教育實施計畫.pdf', type: 'pdf', year: '113', status: 'indexed', updatedAt: '2024-05-01', tags: ['政策', '雙語'] },
    { id: 'd2', name: '雙語教學指引v2.docx', type: 'docx', year: '112', status: 'indexed', updatedAt: '2023-11-20', tags: ['教學', '指引'] },
    { id: 'd3', name: '特教助理員申請辦法.pdf', type: 'pdf', year: '113', status: 'processing', updatedAt: '2024-05-20', tags: ['特教', '補助'] },
    { id: 'd4', name: '校園傳染病防治手冊.pdf', type: 'pdf', year: '112', status: 'error', updatedAt: '2023-09-01', tags: ['衛教', '防疫'] },
];

// Sample chunk preview list.
export const MOCK_CHUNKS = [
    { id: 'ck1', content: '本計畫旨在提升學生英語力...', page: 1 },
    { id: 'ck2', content: '各校應成立雙語推動小組...', page: 2 },
    { id: 'ck3', content: '經費核銷說明...', page: 3 },
    { id: 'ck4', content: '師資培訓相關規定...', page: 4 },
    { id: 'ck5', content: '成效評估指標...', page: 5 },
];
