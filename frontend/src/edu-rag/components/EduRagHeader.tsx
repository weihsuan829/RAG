// EDU-RAG 聊天頁標題列。
const EduRagHeader = () => {
  return (
    <div className="flex items-center justify-between mb-8 py-2">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/30">
          AI
        </div>
        <div>
          <h1 className="text-lg font-bold text-black dark:text-white tracking-wide">
            RAG 系統
          </h1>
        </div>
      </div>
    </div>
  );
};

export default EduRagHeader;
