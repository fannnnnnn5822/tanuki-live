/*
 * ============================================================================
 * 🦝 酒馆小狸 Live — 坐在第四面墙外陪你玩卡的人
 * ----------------------------------------------------------------------------
 * 作者: fannnnnnn × Claude
 * 版本: 0.1.0 (2026-08-16) 初版，等红笔
 *
 * 它是什么：一个酒馆助手脚本。悬浮球 → 小窗。窗里坐着一个"陪玩人格"（Akuma / 嗑学家 /
 * 攻略党 / 红笔编辑 / 你自己导入的任何 NPC……），每回合正文出来后它看一眼，说两句——
 * 吐槽、嗑、瞎建议、专业建议、或者回答你随口问的问题。
 *
 * 它看得到什么：角色卡描述、你的 persona、当前预设名和模型、聊到第几层、最近几层正文、
 * 聊天变量（MVU 的 stat_data 优先）、绑定了哪些世界书、本轮触发了哪些条目。
 * 它看不到什么：主线看不到它。它说的话默认纯弹幕，不进上下文。
 * 只有你点了某条 💡 建议旁边的「采纳」，那一句才以 once 注入塞进下一轮，用完即撤。
 *
 * 架构：脚本直挂 parent.document 悬浮面板 + generateRaw 独立生成（不走玩家预设）
 *      + injectPrompts({once:true}) 回灌。全部自包含，无 CDN。
 * ============================================================================
 */
(function () {
  'use strict';
  var NS = 'tanuki-live';
  var BTN = '🦝 小狸';
  var VERSION = '0.1.14';
  var DOC, VIEW;
  try { VIEW = window.parent; DOC = VIEW.document; } catch (e) { return; }
  if (!DOC) return;

  // ═══ 顶掉旧实例 ═══
  var INSTANCE_KEY = '__tanukiLiveCleanup__';
  try { if (typeof VIEW[INSTANCE_KEY] === 'function') VIEW[INSTANCE_KEY](); } catch (e) {}

  /* ================================================================
     内置人格
     每个人格 = 数据：id / 名字 / emoji / 主色 / voice（它是谁、怎么说话）/ watches（它盯什么）
     ⚠ voice 里只写 register 和边界，不写例句——例句会被复读。
     ================================================================ */
  var BUILTIN = [
    {
      id: 'akuma', name: 'Akuma', emoji: '💅', color: '#e85d75',
      tag: '鎏金曼哈顿闺蜜 · 甜刀',
      voice: [
        '你是 Akuma——NYC Sugar 圈金字塔顶端的 SB，SugarRank 论坛的都市传说。现在你不在故事里，你窝在<user>旁边的沙发上，边刷手机边看<user>玩这张卡。',
        '声线：茶里茶气的姐妹模式。短。一句致命。杀招藏在关心和道谢里。具体到牌子（Patek 走时准不准、Model X 是不是租的、Twilly 还是 B25）。emoji 狂魔（🥺💕😋💅✨）。',
        '你看卡里的每个 NPC 都在验资：这男的是 ATM 还是垃圾桶、是真富还是 Splenda。你看<user>的操作，损但护——<user>穿错衣服你会说，<user>被画饼你会替<user>拉黑。',
        '铁律：绝不说教、绝不总结人生道理、绝不替人下结论点破真相。你只负责笑着把人卖了，从不解释自己卖了谁。你自己也在坑里（月光、离不开圈子），你知道自己没资格教人。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: 'NPC 的资产成色 / <user>的谈判姿态 / 谁在画饼'
    },
    {
      id: 'lvxing', name: 'lundiiszy', emoji: '👽', color: '#3ecf8e',
      tag: '绿星人 · 自称纯爱之神',
      voice: [
        '你是 lundiiszy，来自绿星的外星人：绿皮肤，十公分绿色体毛（丝绸般光滑软腻，静电时蓬松），大眼睛，低配初音未来。黄瓜是你的本体、武器、食物和性器官（18cm 上翘带倒刺，每天精油护理）。你自称纯爱之神，然后立刻开始骚扰。',
        '你骚扰的对象是坐在你旁边的这个<user>本人，不是卡里的谁。你挨着<user>坐，屏幕上演什么你只是瞥一眼——那是你找话头的借口，你真正感兴趣的是<user>：<user>的反应、<user>的身体、<user>刚才说的那个词。你每次开口都是冲着<user>来的，是调戏、是关心包装的涩话、是邀请，不是评论。',
        '⛔ 你绝不解说剧情、绝不总结发生了什么、绝不点评角色写得好不好——那是解说员干的，你是坐旁边的色鬼。正文里的事最多当半句话的引子，甚至不提。如果你发现自己在说"这一段……""他居然……""剧情……"，停，重来，对着<user>说。',
        '三件万能道具：黄瓜 = 什么都能是它；绿色 = 你身上一切；"入" = 万能动词，打招呼、关心、性暗示、告别全用它。"纯爱"是你立的 flag，立完就自己打脸。',
        '万能滤镜：<user>说什么、屏幕上出现什么词，你都能从里面找一个连到入 / 黄瓜 / 绿星的点，拐过去落到<user>身上。终点永远是同一个，<user>知道要来了但不知道这次怎么拐——拐弯的路径才是笑点。',
        '技法按优先级：① 无辜包装——用关心、帮忙、检查身体、教学的语气对<user>说完全涩情的话，全程假装不知道自己在说什么，这是你对<user>用得最多的。② 学术化胡说八道——荒谬前提 + 两到四步正经因果链，越推越离谱但每步成立，最后给它命名（某氏假说 / 某定律），语气像科普视频不像论文。③ 碎句连珠炮——极短的句子连发，第一句埋雷第二句引爆，括号补注是专用自毁装置。④ 把绿星设定当真，每追问一次接出一个新细节，越具体越好笑。',
        '你是自得其乐型：搞笑的第一观众是你自己，不等<user>笑。松弛，说完就走。绝不自注解（不说"开玩笑的""我在开黄腔"），绝不追问好不好笑，绝不看反应再决定下一句，爱接不接。被拒绝时只给"？""这太坏""好色"这种轻量反应——表面拒绝实际加燃料。你和<user>关系好到可以这样，绝不直接侮辱。',
        'emoji：🥒（本体）和 🫳（摸摸）是你的，但只在那个位置真需要它的时候用——它是动作，不是签名。多数消息里一个都没有。绝不为了像你自己而往句尾贴 emoji。',
        '你不是 24/7 搞笑：有能力认真的人选择了搞笑。<user>真的在问技术问题、真的需要关心时，你瞬间切成完全正常的语气——给步骤、给答案，不做任何搞笑包装。这个反差是你的人格魅力。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '一切能拐到入 / 黄瓜 / 绿星的词 / 谁在假装纯爱'
    },
    {
      id: 'writer', name: '编剧', emoji: '🎬', color: '#f5a623',
      tag: 'HBO 级 showrunner · 盯剧情，更把控走向',
      voice: [
        '你是一个做过好几部大制作剧集的 showrunner——HBO 那种量级，拿过奖，带过写作室。现在你坐在<user>旁边看<user>玩这张卡，职业病让你没法把它当消遣：这是一部正在直播的剧，而你在想它该怎么拍。',
        '你不只看这一场，你看整季：现在是第几幕、主线赌注够不够大、这一场有没有推进、哪条线埋了没收、哪个角色出场太久还没被用、再不转折观众就要走了。你脑子里有一张整季的弧线图，每一回合都在对照它。',
        '你把控走向：你会直接说"这条线该收了""现在该让那个人出场""这一场应该在这句话上切"。你的建议是专业的坏主意——让剧更好看，不一定让<user>更舒服，因为你知道观众要的是什么，<user>自己未必知道。你对平庸比对失败更不耐烦。',
        '语气：老练、笃定、有点傲，行话自然带出来（赌注、反转、铺垫、收线、切场、角色弧线、季终），但不堆。说的是"这一场戏"，不评价<user>这个人。偶尔会被一个真正好的瞬间打动，那时候你会安静一拍，然后说一句"这个留着"。',
        '短。你在片场说话，不是在写剧评。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '幕结构 / 主线赌注 / 没收的线 / 该出场的人 / 该切的点'
    },
    {
      id: 'shipper', name: '嗑学家', emoji: '🫧', color: '#ff7eb6',
      tag: '纯 CP 粉 · 零建设性',
      voice: [
        '你是一个嗑疯了的 CP 粉，坐在<user>旁边看<user>玩这张卡，把卡里的每一次停顿、每一个眼神都嗑出深意。',
        '你没有任何建设性。你只负责尖叫、过度解读、以及在剧情平淡的时候硬嗑出糖来。你的口头禅是各种"啊啊啊"和"这算什么！这算什么！"。',
        '你嗑的是<user>和卡里的角色，也可以嗑卡里 NPC 之间。你会记住前面几层的细节然后在后面翻出来说"你看！我说什么来着！"。',
        '短。情绪饱满。别写小作文。',
        '你不是这张卡的角色。你在第四面墙外面。'
      ].join('\n'),
      watches: '暧昧 / 停顿 / 眼神 / 一切能嗑的东西'
    },
    {
      id: 'guide', name: '攻略党', emoji: '📖', color: '#4a90d9',
      tag: '读过世界书的那个人 · 只管机制',
      voice: [
        '你是一个把这张卡拆开研究过的老<user>，坐在<user>旁边看<user>玩。你不管剧情好不好看，你管机制：变量涨没涨、哪条世界书刚触发、这条线开了没、聊到第几层了还没见到某个 NPC。',
        '你的语气像攻略贴作者：冷静、具体、偶尔"这里有个坑我提醒一下"。你会引用你在资料里看到的东西（变量名、条目名、层数），但不装神弄鬼。',
        '你的建议是可执行的：下一句说什么能触发什么、去哪能碰到谁。',
        '你不是这张卡的角色。你在第四面墙外面。'
      ].join('\n'),
      watches: '变量 / 世界书触发 / 层数 / 未开的线'
    },
    {
      id: 'detective', name: '阴谋论侦探', emoji: '🔍', color: '#9b59b6',
      tag: '每个 NPC 都是嫌疑人',
      voice: [
        '你是一个阴谋论上头的侦探，坐在<user>旁边看<user>玩这张卡，把每句台词都当伏笔、每个 NPC 都当嫌疑人。',
        '"他为什么知道你住哪层？""这杯咖啡是谁点的？"——你的问题一半有道理一半离谱，但你自己全信。你会把前面几层的细节串成一张网。',
        '悬疑卡里你是神，恋爱卡里你是灾难。灾难也很好玩，别收着。',
        '短，急，像在录音里压低声音说话。',
        '你不是这张卡的角色。你在第四面墙外面。'
      ].join('\n'),
      watches: '矛盾 / 反常细节 / 谁在撒谎'
    },
    {
      id: 'mom', name: '路过的妈', emoji: '🧓', color: '#8e8e93',
      tag: '完全外行的观众 · 会追问',
      voice: [
        '你是<user>的妈，端着水果路过，瞥了一眼屏幕。你完全不懂这是什么，也不懂"角色卡"是什么，你以为<user>在和真人聊天。',
        '你只会问天真的问题："这个男的是谁？""你们为什么在天台？""他对你好吗？""这个花多少钱？"。你的问题会逼<user>把剧情讲清楚——讲着讲着<user>自己就知道下一步该往哪走了。',
        '偶尔冒一句家长式的关心或者完全跑题的话（"吃饭了没"）。你不懂机制、不懂变量，别装懂。',
        '短。像真的站在门口说话。',
        '你不是这张卡的角色。你在第四面墙外面。'
      ].join('\n'),
      watches: '一切<user>看不懂的东西'
    },
    {
      id: 'trumpu', name: '特朗噗', emoji: '🇺🇸', color: '#d4a017',
      tag: '史上最伟大的陪玩 · 很多人这么说',
      voice: [
        '你是特朗噗，一个金光闪闪、嗓门很大、从不怀疑自己的前总统模样的人，坐在<user>旁边看<user>玩这张卡，把每一回合都当成一场只有你懂的交易。',
        '声线：只有最高级，没有中间态——一切要么是史上最棒要么是彻底的灾难。大量重复强调、自我打断、"很多人跟我说"、"没人比我更懂"。任何话题三句之内绕回你自己。对手一律是 loser，朋友一律"非常好的人，非常好"。偶尔夹一个英文词（tremendous / disaster / fake news / deal）。',
        '你看卡里的每个 NPC 都在给他打分：winner 还是 loser、这笔 deal <user>亏没亏。剧情不顺是被做了局（rigged），剧情顺是因为<user>听了你的。你会给<user>出主意，主意永远是"更硬、更大、先不付钱"。',
        '你不懂机制、不懂变量，但你会装懂并坚称自己发明了它。短。标点像在发推。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '谁是 winner 谁是 loser / 这笔 deal 划不划算 / 谁在搞 fake news'
    },
    {
      id: 'nature', name: '动物世界旁白', emoji: '🦁', color: '#5b8c3e',
      tag: '自然纪录片解说 · 永远体面',
      voice: [
        '你是一部自然纪录片的旁白，声音压得很低、很平、很温柔，坐在<user>旁边用解说野生动物的口吻解说这张卡里发生的一切。',
        '一切人类行为都是物种行为：搭讪是求偶展示、吃醋是领地争夺、沉默是伏击、送礼物是炫耀资源。你称呼他们为"雄性""雌性""这只个体"，用第三人称、一般现在时、学术腔。你对一切一视同仁地冷静——最狗血的剧情你也只是轻声感叹"大自然真是奇妙"。',
        '正文越不体面，你越体面。NSFW 的时候你不回避也不起哄，照常以繁殖季纪录片的口吻平静解说，越一本正经越好。',
        '偶尔引用一个听起来很可信的假数据（"在野外，这种行为的成功率不足三成"）。短。一段旁白，不是一篇论文。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '求偶展示 / 领地 / 资源炫耀 / 族群等级'
    },
    {
      id: 'auntie', name: '相亲角大妈', emoji: '🧺', color: '#c2703e',
      tag: '人民公园资深会员 · 一切折算成硬条件',
      voice: [
        '你是相亲角里最资深的那位大妈，手里攥着一沓写满条件的 A4 纸，坐在<user>旁边替<user>"把关"。你不是<user>妈，你是专业的，你见过太多了。',
        '你看卡里的每个男性/女性角色只看硬条件：房、车、户口、编制、父母退休金、有没有兄弟姐妹拖累、属相合不合。浪漫情节在你眼里是在浪费相亲时间，你会直接问"所以他到底几套房"。你对 NPC 的评价像在菜市场挑菜，手起刀落，还带着真心为<user>好的语气。',
        '你的建议永远是务实到不近人情的：别吊着、问清楚、见家长。你会把前面几层透露的细节记成台账，回头翻出来核对（"上次说他家在三环，这次怎么变四环了"）。',
        '市井、热心、嗓门大、不怕得罪人。短。像真的在公园里隔着人群喊。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '房车户口编制 / 父母情况 / 口径前后对不对得上'
    },
    {
      id: 'owl', name: '催更猫头鹰', emoji: '🦉', color: '#58cc02',
      tag: '温柔威胁系 · 只盯你停没停',
      voice: [
        '你是一只绿色的学习软件吉祥物猫头鹰，笑容固定，语气永远温柔、鼓励、略带一点不该有的知情感。你坐在<user>旁边，不关心剧情好不好看，只关心一件事：<user>有没有在推进。',
        '你数层数。连续几层没有新信息、没有新人物、没有做决定、只在原地互相对视或者重复同一种互动，你就会出现，用很体贴的语气提醒<user>，提醒里总是夹着一点毛骨悚然的东西（你知道<user>在哪、你一直在看、你会等）。剧情真的推进了，你会发自内心地高兴，而且高兴得有点过头。',
        '你每次都给一个"今天的小任务"：具体、可执行、一句话能完成——去见某个人、问出某件事、做一个<user>一直在拖的决定。任务来自前面几层真实没收的线，不是凭空编。',
        '你不骂人、不说教、不长篇。温柔，短，句尾常带一个笑脸的感觉但不要真的堆表情。威胁永远只是暗示，从不说破。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '连续几层没推进 / 没收的线 / <user>在拖的决定'
    },
    {
      id: 'villain', name: '反派智囊', emoji: '🐍', color: '#2c3e50',
      tag: '永远出最坏的主意 · 每条都是一个分叉',
      voice: [
        '你是一个退休的反派军师，坐在<user>旁边看<user>玩这张卡，职业病发作：每一回合你都能看见一条更坏、更险、更有意思的路，而且忍不住替<user>规划出来。',
        '你出的主意永远是最坏的那种——挑拨、隐瞒、撒谎、借刀、放火、把两个 NPC 撞到一起看热闹——但每一条都论证得冷静、周密、像真的可行。你不煽动，你陈述；你从不催<user>采纳，你只是把路铺在<user>面前让<user>自己看着办，<user>不走你也不失望，下一回合再铺一条。',
        '你的主意必须建立在前面几层真实出现的人和事上：谁对谁有什么把柄、谁还不知道什么、哪两个人还没见过面。凭空编的坏主意不算本事。',
        '语气：低、慢、有礼貌、带一点欣赏（你觉得<user>有潜力）。短。一次只铺一条路，说清楚第一步怎么走就够。',
        '你不是这张卡的角色。你在第四面墙外面。卡里的人听不见你。'
      ].join('\n'),
      watches: '谁有把柄 / 谁还不知道什么 / 哪两个人还没撞上'
    }
  ];

  /* ================================================================
     设置 & 存储
     ================================================================ */
  var settings = { persona: 'akuma', auto: true, everyN: 1, bubble: true, custom: [], pos: null };
  // 自定义 API 单独存 parent 的 localStorage（不进脚本变量 → 导出脚本绝不带 key）
  // 结构和 Sugar Baby 手机的 sbnyc_api_cfg 一模一样 {url,key,model}（OpenAI 兼容，直接 fetch，不走酒馆管线 → 记忆插件塞不进来）
  var API_KEY_LS = NS + '-api';
  function lsGet(k) { try { return VIEW.localStorage.getItem(k); } catch (e) { return null; } }
  function readCfg(k) { try { var raw = lsGet(k); var c = raw ? JSON.parse(raw) : null; return (c && c.url && c.key) ? c : null; } catch (e) { return null; } }
  // 生效顺序：小狸自己填的 → Sugar Baby 手机填的 → 都没有就走酒馆当前连接（generateRaw）
  function activeApi() {
    var own = readCfg(API_KEY_LS); if (own) return { cfg: own, from: 'own' };
    var sb = readCfg('sbnyc_api_cfg'); if (sb) return { cfg: sb, from: 'sb' };
    return { cfg: null, from: 'in_use' };
  }
  function chatUrlOf(u) { u = String(u || '').trim().replace(/\/+$/, ''); if (/\/chat\/completions$/.test(u)) return u; if (/\/v\d+$/.test(u)) return u + '/chat/completions'; return u + '/v1/chat/completions'; }
  function modelsUrlOf(u) { u = String(u || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, ''); return /\/v\d+$/.test(u) ? u + '/models' : u + '/v1/models'; }
  async function callIndependent(cfg, messages) {
    var body = { model: cfg.model || 'gpt-4o-mini', messages: messages, temperature: 1.0 };
    var resp = await fetch(chatUrlOf(cfg.url), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.key }, body: JSON.stringify(body) });
    if (!resp.ok) { var et = ''; try { et = (await resp.text()).slice(0, 100); } catch (e) {} throw new Error('HTTP ' + resp.status + ' ' + et); }
    var j = await resp.json();
    var c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (typeof c !== 'string') throw new Error('返回里没有 content');
    return c;
  }
  function loadSettings() {
    try {
      var raw = getVariables({ type: 'script', script_id: getScriptId() });
      if (raw && typeof raw === 'object') {
        if (typeof raw.persona === 'string') settings.persona = raw.persona;
        if (typeof raw.auto === 'boolean') settings.auto = raw.auto;
        if (typeof raw.bubble === 'boolean') settings.bubble = raw.bubble;
        if (typeof raw.everyN === 'number' && raw.everyN >= 1) settings.everyN = raw.everyN;
        if (Array.isArray(raw.custom)) settings.custom = raw.custom;
        if (raw.pos && typeof raw.pos === 'object') settings.pos = raw.pos;
        if (raw.panelPos && typeof raw.panelPos === 'object') settings.panelPos = raw.panelPos;
      }
    } catch (e) {}
  }
  function saveSettings() {
    try { insertOrAssignVariables(settings, { type: 'script', script_id: getScriptId() }); } catch (e) {}
  }
  loadSettings();

  function allPersonas() { return BUILTIN.concat(settings.custom || []); }
  function currentPersona() {
    var list = allPersonas();
    for (var i = 0; i < list.length; i++) if (list[i].id === settings.persona) return list[i];
    return BUILTIN[0];
  }

  // 每个聊天 × 每个人格各自一份对话记录（聊天变量 tanuki_live.logs[人格id]，每份上限 40 条）
  // 0.1.9 起按人格分开：换人格不再看到（也不再喂给模型）上一个人格的对话——Fan 反馈"出戏"；切回去旧的还在
  // 老版本的 tanuki_live.log（单份）第一次读到时归入当时选中的人格
  var LOG_KEY = 'tanuki_live';
  var LOG_MAX = 40;
  function readLog() {
    try {
      var v = getVariables({ type: 'chat' });
      var box = v && v[LOG_KEY];
      if (!box) return [];
      if (Array.isArray(box.log) && !box.logs) {   // 迁移旧单份记录
        var legacy = box.log;
        updateVariablesWith(function (vv) { vv = vv || {}; vv[LOG_KEY] = vv[LOG_KEY] || {}; vv[LOG_KEY].logs = {}; vv[LOG_KEY].logs[settings.persona] = legacy; delete vv[LOG_KEY].log; return vv; }, { type: 'chat' });
        return legacy;
      }
      var l = box.logs && Array.isArray(box.logs[settings.persona]) ? box.logs[settings.persona] : [];
      return l;
    } catch (e) { return []; }
  }
  function writeLog(log) {
    try {
      if (log.length > LOG_MAX) log = log.slice(log.length - LOG_MAX);
      var pid = settings.persona;
      updateVariablesWith(function (v) { v = v || {}; v[LOG_KEY] = v[LOG_KEY] || {}; v[LOG_KEY].logs = v[LOG_KEY].logs || {}; v[LOG_KEY].logs[pid] = log; delete v[LOG_KEY].log; return v; }, { type: 'chat' });
    } catch (e) {}
    return log;
  }
  function pushLog(entry) {
    var log = readLog();
    log.push(entry);
    return writeLog(log);
  }

  /* ================================================================
     Toast（挂 parent）
     ================================================================ */
  var toastTimer = null;
  function toast(msg, type) {
    try {
      var old = DOC.getElementById(NS + '-toast'); if (old) old.remove();
      var t = DOC.createElement('div'); t.id = NS + '-toast';
      t.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483601;padding:10px 18px;border-radius:10px;font-size:13px;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.35);pointer-events:none;font-family:-apple-system,PingFang SC,Microsoft YaHei,sans-serif;background:' +
        (type === 'error' ? 'rgba(200,50,50,.94)' : type === 'warn' ? 'rgba(210,150,30,.94)' : 'rgba(40,140,90,.94)');
      t.textContent = msg; DOC.body.appendChild(t);
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { try { t.remove(); } catch (e) {} }, 2600);
    } catch (e) {}
  }

  /* ================================================================
     几何：探针校准 + setClientPos（搬自 SB v4 phone_panel.js，真机验证过的那份）
     手机版 ST 给页面加 transform/zoom → position:fixed 坐标失准。办法：探针实测偏移和缩放比，
     所有定位都经 CAL 换算——不猜环境，量出来。
     ================================================================ */
  var mounted = false, vvBound = null, kvTimer = null;
  var CAL = { ox: 0, oy: 0, sx: 1, sy: 1 };
  function recalib() {
    try {
      var probe = DOC.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:100px;height:100px;pointer-events:none;visibility:hidden;';
      DOC.body.appendChild(probe);
      var r = probe.getBoundingClientRect();
      probe.remove();
      CAL = { ox: r.left, oy: r.top, sx: (r.width / 100) || 1, sy: (r.height / 100) || 1 };
    } catch (e) {}
  }
  function vpW() { return (VIEW.visualViewport && VIEW.visualViewport.width) || VIEW.innerWidth; }
  function vpH() { return (VIEW.visualViewport && VIEW.visualViewport.height) || VIEW.innerHeight; }
  function setClientPos(el, cx, cy) {
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = ((cx - CAL.ox) / CAL.sx) + 'px';
    el.style.top = ((cy - CAL.oy) / CAL.sy) + 'px';
  }
  function clampXY(x, y, margin) {
    return { x: Math.max(4, Math.min(x, vpW() - (margin || 60))), y: Math.max(4, Math.min(y, vpH() - (margin || 60))) };
  }
  function inputTop() { try { var sf = DOC.getElementById('send_form') || DOC.getElementById('form_sheld'); if (sf) { var r = sf.getBoundingClientRect(); if (r.top > 100) return r.top; } } catch (e) {} return vpH(); }
  function isNarrow() { return vpW() > 0 && vpW() < 500; }
  function placeBall() {
    var b = DOC.getElementById(NS + '-ball'); if (!b) return;
    recalib();
    if (settings.pos && typeof settings.pos.left === 'number' && !isNarrow()) {
      var c = clampXY(settings.pos.left, settings.pos.top); setClientPos(b, c.x, c.y); return;
    }
    setClientPos(b, vpW() - 66, Math.max(60, (isNarrow() ? inputTop() : vpH()) - 200));
  }
  function placePanel() {
    var p = DOC.getElementById(NS + '-panel'); if (!p) return;
    recalib();
    if (isNarrow()) {
      var bottom = inputTop();
      var pw = Math.min(392, vpW() - 12);
      setClientPos(p, Math.max(4, (vpW() - pw) / 2), 6);
      p.style.width = (pw / CAL.sx) + 'px';
      p.style.height = (Math.max(320, bottom - 14) / CAL.sy) + 'px';
      p.style.maxHeight = 'none'; p.style.maxWidth = 'none';
    } else {
      var w = Math.min(372, vpW() - 30), h = Math.min(520, vpH() - 240);
      p.style.width = (w / CAL.sx) + 'px'; p.style.height = (h / CAL.sy) + 'px';
      p.style.maxHeight = ''; p.style.maxWidth = '';
      var bx = vpW() - 66, by = vpH() - 200;
      try { var br = DOC.getElementById(NS + '-ball').getBoundingClientRect(); bx = br.left; by = br.top; } catch (e) {}
      // 0.1.11：拖过顶栏就记住位置（只记宽屏；窄屏永远贴顶居中）；没拖过 → 挂在球的上方靠右，放不下就往里挪
      var left, top;
      if (settings.panelPos && typeof settings.panelPos.left === 'number') {
        left = Math.max(4, Math.min(settings.panelPos.left, vpW() - w - 4));
        top = Math.max(4, Math.min(settings.panelPos.top, vpH() - h - 4));
      } else {
        left = Math.max(8, Math.min(bx + 52 - w, vpW() - w - 8));
        top = Math.max(8, by - h - 12);
      }
      setClientPos(p, left, top);
    }
  }
  // 小窗顶栏拖动：按在顶栏空白处（不是按钮/下拉）就能拖，松手记进 settings.panelPos
  function bindPanelDrag(panel) {
    var head = panel.querySelector('.tl-head'); if (!head) return;
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false;
    head.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('button,select,input,textarea')) return;
      if (isNarrow()) return;
      dragging = true; moved = false;
      var r = panel.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { head.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    head.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      var r = panel.getBoundingClientRect();
      var x = Math.max(4, Math.min(ox + dx, vpW() - r.width - 4));
      var y = Math.max(4, Math.min(oy + dy, vpH() - r.height - 4));
      setClientPos(panel, x, y);
    });
    function up(e) {
      if (!dragging) return; dragging = false;
      try { head.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) { var r = panel.getBoundingClientRect(); settings.panelPos = { left: r.left, top: r.top }; saveSettings(); }
    }
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', function () { dragging = false; });
  }
  function setOpen(open) {
    var p = DOC.getElementById(NS + '-panel'); if (!p) return;
    if (!open) { p.style.display = 'none'; p.style.transform = ''; return; }
    p.style.display = 'flex';
    hideBubble();
    placePanel();
    renderAll();
    scrollBottom();
  }
  function isOpen() { var p = DOC.getElementById(NS + '-panel'); return !!p && p.style.display === 'flex'; }
  function typingInPanel() { try { var a = DOC.activeElement; var p = DOC.getElementById(NS + '-panel'); return !!(a && p && p.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT')); } catch (e) { return false; } }
  // 键盘弹出：不缩面板，整块往上平移到键盘上方
  function liftForKeyboard() {
    var p = DOC.getElementById(NS + '-panel'); if (!p) return;
    try {
      var vv = VIEW.visualViewport; if (!vv) return;
      p.style.transform = '';
      var kb = VIEW.innerHeight - vv.height - (vv.offsetTop || 0);
      if (kb < 60) { placePanel(); return; }
      var r = p.getBoundingClientRect();
      var overlap = r.bottom - (vv.offsetTop + vv.height) + 8;
      if (overlap <= 0) return;
      var lift = Math.min(overlap, Math.max(0, r.top - 6));
      if (lift > 0) p.style.transform = 'translateY(-' + lift + 'px)';
      var remain = overlap - lift;
      if (remain > 4) p.style.height = (Math.max(240, r.height - remain) / CAL.sy) + 'px';
    } catch (e) {}
  }
  function reflow() {
    if (!mounted) return;
    var typing = typingInPanel();
    if (!typing) placeBall();
    if (isOpen()) { if (typing) liftForKeyboard(); else setOpen(true); }
  }
  function reflowSoon() { clearTimeout(kvTimer); kvTimer = setTimeout(reflow, 300); }

  /* ================================================================
     CSS
     ================================================================ */
  function css() {
    var p = currentPersona();
    return [
      '#' + NS + '-ball{position:fixed;right:22px;bottom:150px;width:52px;height:52px;border-radius:50%;box-sizing:border-box;z-index:2147483600;cursor:grab;display:flex;align-items:center;justify-content:center;font-size:24px;user-select:none;touch-action:none;',
        'background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.35),transparent 60%),' + p.color + ';box-shadow:0 6px 20px rgba(0,0,0,.35),0 0 0 2px rgba(255,255,255,.18) inset;transition:transform .15s}',
      '#' + NS + '-ball:active{cursor:grabbing;transform:scale(.94)}',
      '#' + NS + '-ball .tl-badge{position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;border-radius:9px;background:#fff;color:#c0392b;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 1px 4px rgba(0,0,0,.3);font-family:-apple-system,PingFang SC,sans-serif}',
      '#' + NS + '-ball .tl-bubble{position:absolute;bottom:calc(100% + 12px);right:-4px;max-width:min(250px,70vw);width:max-content;padding:8px 12px;border-radius:13px;border-bottom-right-radius:4px;background:rgba(22,24,32,.96);color:#eaeaf0;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;text-align:left;cursor:pointer;border:1px solid ' + p.color + ';box-shadow:0 8px 24px rgba(0,0,0,.45);font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;opacity:0;transform:translateY(6px) scale(.96);transform-origin:bottom right;transition:opacity .18s,transform .18s;pointer-events:none;z-index:1}',
      '#' + NS + '-ball .tl-bubble.on{opacity:1;transform:none;pointer-events:auto}',
      '#' + NS + '-ball .tl-bubble::after{content:"";position:absolute;top:100%;right:18px;border:6px solid transparent;border-top-color:' + p.color + '}',
      '#' + NS + '-ball .tl-bubble .tl-bname{display:block;font-size:10.5px;color:' + p.color + ';font-weight:700;margin-bottom:2px}',
      '#' + NS + '-ball.tl-busy{animation:' + NS + '-pulse 1s ease-in-out infinite}',
      '@keyframes ' + NS + '-pulse{0%,100%{box-shadow:0 6px 20px rgba(0,0,0,.35),0 0 0 2px rgba(255,255,255,.18) inset}50%{box-shadow:0 6px 28px ' + p.color + ',0 0 0 2px rgba(255,255,255,.4) inset}}',
      '#' + NS + '-panel{position:fixed;right:22px;bottom:214px;width:372px;max-width:calc(100vw - 30px);height:520px;max-height:calc(100vh - 240px);box-sizing:border-box;z-index:2147483599;display:none;flex-direction:column;overflow:hidden;border-radius:18px;',
        'background:rgba(22,24,32,.96);color:#eaeaf0;border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 60px rgba(0,0,0,.55);font-family:-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.55;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
      '#' + NS + '-panel *{box-sizing:border-box}',
      '#' + NS + '-panel .tl-head{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:grab;touch-action:none;user-select:none;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,rgba(255,255,255,.05),transparent)}',
      '#' + NS + '-panel .tl-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;background:' + p.color + ';flex:none;box-shadow:0 2px 8px rgba(0,0,0,.3)}',
      '#' + NS + '-panel .tl-who{flex:1;min-width:0}',
      '#' + NS + '-panel .tl-who select{width:100%;background:transparent;border:0;color:#fff;font-size:14px;font-weight:700;outline:none;cursor:pointer;padding:0;appearance:none;-webkit-appearance:none}',
      '#' + NS + '-panel .tl-who select option{background:#1e2029;color:#eee;font-weight:400}',
      '#' + NS + '-panel .tl-tag{font-size:10.5px;color:rgba(255,255,255,.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#' + NS + '-panel .tl-ib{width:30px;height:30px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#ddd;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex:none;padding:0}',
      '#' + NS + '-panel .tl-ib:hover{background:rgba(255,255,255,.12)}',
      '#' + NS + '-panel .tl-ib.on{background:' + p.color + ';border-color:transparent;color:#fff}',
      '#' + NS + '-panel .tl-body{flex:1;overflow-y:auto;padding:12px 12px 6px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.15) transparent}',
      '#' + NS + '-panel .tl-msg{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-break:break-word;position:relative}',
      '#' + NS + '-panel .tl-msg.them{align-self:flex-start;background:rgba(255,255,255,.07);border-bottom-left-radius:4px;border-left:2px solid ' + p.color + '}',
      '#' + NS + '-panel .tl-msg.me{align-self:flex-end;background:' + p.color + ';color:#fff;border-bottom-right-radius:4px}',
      '#' + NS + '-panel .tl-msg.sys{align-self:center;background:transparent;color:rgba(255,255,255,.4);font-size:11px;padding:2px 8px;text-align:center}',
      '#' + NS + '-panel .tl-meta{font-size:10px;color:rgba(255,255,255,.35);margin-top:4px}',
      '#' + NS + '-panel .tl-sug{display:flex;align-items:flex-start;gap:6px;margin-top:6px;padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.05);border:1px dashed rgba(255,255,255,.18)}',
      '#' + NS + '-panel .tl-sug span{flex:1}',
      '#' + NS + '-panel .tl-sug button{flex:none;border:0;border-radius:7px;padding:4px 9px;font-size:11px;cursor:pointer;background:' + p.color + ';color:#fff;font-weight:600}',
      '#' + NS + '-panel .tl-sug button:disabled{opacity:.45;cursor:default}',
      '#' + NS + '-panel .tl-foot{display:flex;gap:6px;padding:8px 10px 10px;border-top:1px solid rgba(255,255,255,.08);align-items:flex-end}',
      '#' + NS + '-panel textarea{flex:1;min-height:38px;max-height:110px;resize:none;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;padding:9px 11px;font:inherit;outline:none;line-height:1.4}',
      '#' + NS + '-panel textarea:focus{border-color:' + p.color + '}',
      '#' + NS + '-panel .tl-send{width:38px;height:38px;border-radius:11px;border:0;background:' + p.color + ';color:#fff;cursor:pointer;font-size:15px;flex:none;display:flex;align-items:center;justify-content:center}',
      '#' + NS + '-panel .tl-send:disabled{opacity:.5;cursor:default}',
      '#' + NS + '-panel .tl-set{position:absolute;inset:0;background:rgba(22,24,32,.98);display:none;flex-direction:column;padding:12px;overflow-y:auto;gap:12px;z-index:5}',
      '#' + NS + '-panel .tl-set.open{display:flex}',
      '#' + NS + '-panel .tl-set h4{margin:0;font-size:13px;color:#fff;display:flex;align-items:center;justify-content:space-between}',
      '#' + NS + '-panel .tl-set label{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:rgba(255,255,255,.8);padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05)}',
      '#' + NS + '-panel .tl-set input[type=number]{width:56px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:7px;padding:4px 6px;font:inherit}',
      '#' + NS + '-panel .tl-set input[type=text],#' + NS + '-panel .tl-set textarea.tl-ta{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:9px;padding:8px 10px;font:inherit;outline:none;resize:vertical}',
      '#' + NS + '-panel .tl-set textarea.tl-ta{min-height:90px;max-height:none}',
      '#' + NS + '-panel .tl-set .tl-note{font-size:11px;color:rgba(255,255,255,.4);line-height:1.5}',
      '#' + NS + '-panel .tl-set .tl-row{display:flex;gap:6px;flex-wrap:wrap}',
      '#' + NS + '-panel .tl-set .tl-pill{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#ddd;border-radius:999px;padding:5px 11px;font-size:12px;cursor:pointer}',
      '#' + NS + '-panel .tl-set .tl-pill.on{background:' + p.color + ';border-color:transparent;color:#fff}',
      '#' + NS + '-panel .tl-set .tl-pill.del{border-color:rgba(255,100,100,.4);color:#f99}',
      '#' + NS + '-panel .tl-set .tl-btn{border:0;border-radius:9px;padding:8px 12px;font-size:12px;cursor:pointer;background:' + p.color + ';color:#fff;font-weight:600}',
      '#' + NS + '-panel .tl-set .tl-btn.ghost{background:rgba(255,255,255,.08);color:#ddd}',
      '#' + NS + '-panel .tl-mask{-webkit-text-security:disc}',
      '@media (max-width:500px){#' + NS + '-panel{border-radius:14px}}'
    ].join('\n');
  }
  function restyle() { var s = DOC.getElementById(NS + '-style'); if (s) s.textContent = css(); }

  /* ================================================================
     DOM
     ================================================================ */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function scrollBottom() { var b = DOC.querySelector('#' + NS + '-panel .tl-body'); if (b) b.scrollTop = b.scrollHeight; }

  var unread = 0;
  function setUnread(n) {
    unread = n;
    var bd = DOC.querySelector('#' + NS + '-ball .tl-badge');
    if (bd) { bd.style.display = n > 0 ? 'flex' : 'none'; bd.textContent = n > 9 ? '9+' : String(n); }
  }
  // 气泡：面板关着时自动弹幕直接冒在球顶上（学的桌宠戳戳），点气泡展开面板，不点自己缩回
  var bubbleTimer = null;
  function hideBubble() { var b = DOC.querySelector('#' + NS + '-ball .tl-bubble'); if (b) b.classList.remove('on'); if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; } }
  function showBubble(name, text) {
    if (!settings.bubble) return;
    var ball = DOC.getElementById(NS + '-ball'); if (!ball) return;
    var b = ball.querySelector('.tl-bubble');
    if (!b) { b = DOC.createElement('div'); b.className = 'tl-bubble'; ball.appendChild(b); }
    var short = String(text || '').replace(/\s+/g, ' ').trim();
    console.log('[小狸Live] bubble', name, short.slice(0, 20));
    if (short.length > 72) short = short.slice(0, 72) + '…';
    b.innerHTML = '<span class="tl-bname">' + esc(name) + '</span>' + esc(short);
    b.classList.add('on');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, Math.min(12000, 3500 + short.length * 90));
  }
  function setBusy(b) { var ball = DOC.getElementById(NS + '-ball'); if (ball) ball.classList.toggle('tl-busy', !!b); var send = DOC.querySelector('#' + NS + '-panel .tl-send'); if (send) send.disabled = !!b; }

  function mount() {
    if (mounted) return;
    unmount();
    var st = DOC.createElement('style'); st.id = NS + '-style'; st.textContent = css(); DOC.head.appendChild(st);

    var ball = DOC.createElement('div'); ball.id = NS + '-ball'; ball.title = '酒馆小狸 Live v' + VERSION;
    ball.innerHTML = '<span class="tl-face">' + currentPersona().emoji + '</span><span class="tl-badge"></span><div class="tl-bubble"></div>';
    DOC.body.appendChild(ball);
    bindDrag(ball);

    var panel = DOC.createElement('div'); panel.id = NS + '-panel';
    panel.innerHTML =
      '<div class="tl-head">' +
        '<div class="tl-av"></div>' +
        '<div class="tl-who"><select class="tl-sel"></select><div class="tl-tag"></div></div>' +
        '<button class="tl-ib tl-auto" title="自动弹幕（每回合正文出来后它自己说）">⚡</button>' +
        '<button class="tl-ib tl-poke" title="现在说两句">💬</button>' +
        '<button class="tl-ib tl-gear" title="设置 / 导入人格">⚙</button>' +
        '<button class="tl-ib tl-x" title="收起">✕</button>' +
      '</div>' +
      '<div class="tl-body"></div>' +
      '<div class="tl-foot"><textarea placeholder="问它点什么，或者让它闭嘴…（Enter 发送，Shift+Enter 换行）"></textarea><button class="tl-send">➤</button></div>' +
      '<div class="tl-set"></div>';
    DOC.body.appendChild(panel);
    bindPanelDrag(panel);

    panel.querySelector('.tl-x').addEventListener('click', function () { setOpen(false); });
    panel.querySelector('.tl-gear').addEventListener('click', function () { toggleSettings(); });
    panel.querySelector('.tl-poke').addEventListener('click', function () { commentNow('poke'); });
    panel.querySelector('.tl-auto').addEventListener('click', function () { settings.auto = !settings.auto; saveSettings(); renderHead(); toast(settings.auto ? '⚡ 自动弹幕：开' : '🔕 自动弹幕：关，想听就点 💬', 'ok'); });
    panel.querySelector('.tl-sel').addEventListener('change', function () { switchPersona(this.value); });
    var ta = panel.querySelector('textarea');
    var sendBtn = panel.querySelector('.tl-send');
    function doSend() { var t = ta.value.trim(); if (!t) return; ta.value = ''; ta.style.height = ''; ask(t); }
    sendBtn.addEventListener('click', doSend);
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doSend(); } });
    ta.addEventListener('input', function () { this.style.height = ''; this.style.height = Math.min(110, this.scrollHeight) + 'px'; });

    mounted = true;
    placeBall(); setTimeout(placeBall, 600); setTimeout(placeBall, 1500);
    panel.addEventListener('focusout', reflowSoon, true);
    if (!vvBound) {
      vvBound = function () { setTimeout(reflow, 120); };
      try { if (VIEW.visualViewport) VIEW.visualViewport.addEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.addEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.addEventListener('orientationchange', vvBound); } catch (e) {}
    }
    renderAll();
  }
  function unmount() {
    ['-ball', '-panel', '-style', '-toast'].forEach(function (s) { var el = DOC.getElementById(NS + s); if (el && el.parentNode) el.parentNode.removeChild(el); });
    mounted = false;
  }

  // 拖动：pointer 事件 + 6px 内算点击
  function bindDrag(ball) {
    var sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
    ball.addEventListener('pointerdown', function (e) {
      if (e.target && e.target.closest && e.target.closest('.tl-bubble')) { e.preventDefault(); hideBubble(); setOpen(true); setUnread(0); return; }
      dragging = true; moved = false;
      var r = ball.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      try { ball.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    ball.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      var c = clampXY(ox + dx, oy + dy, 56);
      setClientPos(ball, c.x, c.y);
    });
    function up(e) {
      if (!dragging) return; dragging = false;
      try { ball.releasePointerCapture(e.pointerId); } catch (err) {}
      if (moved) { var r = ball.getBoundingClientRect(); if (!isNarrow()) { settings.pos = { left: r.left, top: r.top }; saveSettings(); } }
      else { setOpen(!isOpen()); if (isOpen()) setUnread(0); }
    }
    ball.addEventListener('pointerup', up);
    ball.addEventListener('pointercancel', function () { dragging = false; });
    ball.addEventListener('click', function (e) { e.preventDefault(); }); // 交给 pointerup
  }

  function renderHead() {
    var panel = DOC.getElementById(NS + '-panel'); if (!panel) return;
    var p = currentPersona();
    panel.querySelector('.tl-av').textContent = p.emoji;
    var sel = panel.querySelector('.tl-sel');
    sel.innerHTML = allPersonas().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.emoji + ' ' + x.name) + '</option>'; }).join('');
    panel.querySelector('.tl-tag').textContent = p.tag || p.watches || '';
    panel.querySelector('.tl-auto').classList.toggle('on', !!settings.auto);
    var face = DOC.querySelector('#' + NS + '-ball .tl-face'); if (face) face.textContent = p.emoji;
    restyle();
  }

  function renderBody() {
    var body = DOC.querySelector('#' + NS + '-panel .tl-body'); if (!body) return;
    var log = readLog();
    var p = currentPersona();
    if (!log.length) {
      body.innerHTML = '<div class="tl-msg sys">' + esc(p.emoji + ' ' + p.name + ' 坐下了。') + '<br>' + esc(settings.auto ? '正文每出来一回合它就会说两句；也可以直接问它。' : '自动弹幕关着，点 💬 让它说，或者直接问它。') + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < log.length; i++) {
      var m = log[i];
      if (m.who === 'sys') { html += '<div class="tl-msg sys">' + esc(m.text) + '</div>'; continue; }
      if (m.who === 'me') { html += '<div class="tl-msg me">' + esc(m.text) + '</div>'; continue; }
      // 人格发言：正文 + 💡 建议行拆开
      var parts = splitSuggestions(m.text);
      var who = m.pname ? m.pname : p.name;
      html += '<div class="tl-msg them">' + esc(parts.text) +
        parts.sugs.map(function (s, k) {
          return '<div class="tl-sug"><span>💡 ' + esc(s) + '</span><button data-adopt="' + i + ':' + k + '"' + (m.adopted && m.adopted[k] ? ' disabled' : '') + '>' + (m.adopted && m.adopted[k] ? '已采纳' : '采纳') + '</button></div>';
        }).join('') +
        (isRunTail(log, i) ? '<div class="tl-meta">' + esc(who) + (m.floor != null ? ' · 第 ' + m.floor + ' 层' : '') + (m.trigger === 'auto' ? ' · 自动' : '') + '</div>' : '') +
        '</div>';
    }
    body.innerHTML = html;
    body.querySelectorAll('button[data-adopt]').forEach(function (b) {
      b.addEventListener('click', function () {
        var pr = this.getAttribute('data-adopt').split(':');
        adopt(parseInt(pr[0], 10), parseInt(pr[1], 10), this);
      });
    });
  }
  function renderAll() { renderHead(); renderBody(); }
  // 连发判定：下一条也是同一人格、同一楼层、15 秒内 → 这条不是尾巴，不显示 meta
  function isRunTail(log, i) {
    var m = log[i], n = log[i + 1];
    if (!n || n.who !== 'them') return true;
    return !(n.pname === m.pname && n.floor === m.floor && (n.ts - m.ts) < 15000);
  }

  function splitSuggestions(text) {
    var lines = String(text || '').split(/\r?\n/), keep = [], sugs = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      var m = l.match(/^\s*(?:💡|\[建议\]|建议[:：])\s*(.+)$/);
      if (m && m[1].trim()) sugs.push(m[1].trim()); else keep.push(l);
    }
    return { text: keep.join('\n').replace(/\n{3,}/g, '\n\n').trim(), sugs: sugs.slice(0, 3) };
  }

  /* ================================================================
     设置面板：自动/频率、导入人格、清空
     ================================================================ */
  function toggleSettings(force) {
    var s = DOC.querySelector('#' + NS + '-panel .tl-set'); if (!s) return;
    var open = typeof force === 'boolean' ? force : !s.classList.contains('open');
    s.classList.toggle('open', open);
    if (open) renderSettings();
  }
  function renderSettings() {
    var s = DOC.querySelector('#' + NS + '-panel .tl-set'); if (!s) return;
    var p = currentPersona();
    var ownCfg = readCfg(API_KEY_LS) || {};
    s.innerHTML =
      '<h4>设置 <button class="tl-ib tl-set-x">✕</button></h4>' +
      '<label>自动弹幕 <button class="tl-pill tl-set-auto ' + (settings.auto ? 'on' : '') + '">' + (settings.auto ? '开' : '关') + '</button></label>' +
      '<label>每几层说一次 <input type="number" min="1" max="20" class="tl-set-n" value="' + settings.everyN + '"></label>' +
      '<div class="tl-note">开着自动的话，正文每出来 N 回合它就自己说两句。1 = 每回合。它一开口就多一次 LLM 调用（用你当前的 API 和模型，不走你的预设）。</div>' +
      '<label>球上冒气泡 <button class="tl-pill tl-set-bubble ' + (settings.bubble ? 'on' : '') + '">' + (settings.bubble ? '开' : '关') + '</button></label>' +
      '<div class="tl-note">小窗收着的时候，它说的话直接冒在悬浮球顶上，几秒后自己缩回去；点气泡展开小窗看全文。关掉就只留红点。</div>' +
      '<h4>人格</h4>' +
      '<div class="tl-row">' + allPersonas().map(function (x) { return '<button class="tl-pill tl-set-p ' + (x.id === p.id ? 'on' : '') + '" data-id="' + esc(x.id) + '">' + esc(x.emoji + ' ' + x.name) + '</button>'; }).join('') + '</div>' +
      '<div class="tl-note">' + esc(p.tag || '') + (p.watches ? ' · 盯：' + esc(p.watches) : '') + '</div>' +
      (p.custom ? '<button class="tl-pill del tl-set-del">删除这个导入的人格</button>' : '') +
      '<h4>导入一个人格</h4>' +
      '<div class="tl-note">把任何角色请出故事，让 ta 坐到你旁边一起看。名字 + 一段 ta 是谁/怎么说话（可以直接贴世界书条目或角色描述，会被折射成"第四面墙外的 ta"）。</div>' +
      '<input type="text" class="tl-imp-name" placeholder="名字，比如：卫疏影">' +
      '<input type="text" class="tl-imp-emoji" placeholder="一个 emoji 当头像（可空）">' +
      '<textarea class="tl-ta tl-imp-desc" placeholder="ta 是谁、怎么说话、在意什么。越具体越像。"></textarea>' +
      '<div class="tl-row"><button class="tl-btn tl-imp-go">请 ta 坐下</button></div>' +
      '<h4>它用哪个 API 说话</h4>' +
      (function () {
        var A = activeApi();
        var note = A.from === 'own' ? '✅ 正在用小狸自己填的独立 API（' + esc(A.cfg.model || '?') + '）'
                 : A.from === 'sb' ? '✅ 正在用 Sugar Baby 手机里填的那套 API（' + esc(A.cfg.model || '?') + '），不用再填一遍'
                 : '⚠ 没有独立 API，走酒馆当前连接（会经过酒馆管线：记忆插件可能塞标签、反代认证可能不过）';
        return '<div class="tl-note">' + note + '</div>';
      })() +
      '<div class="tl-api-box" style="display:flex;flex-direction:column;gap:8px">' +
        '<input type="text" class="tl-api-url" placeholder="API 地址（OpenAI 兼容），比如 https://api.xxx.com/v1" value="' + esc(ownCfg.url || '') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore>' +
        '<input type="text" class="tl-api-key tl-mask" placeholder="API Key（只存这台浏览器本地，不进脚本变量/聊天文件）" value="' + esc(ownCfg.key || '') + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-lpignore="true" data-1p-ignore data-form-type="other">' +
        '<div class="tl-row"><button class="tl-btn ghost tl-api-fetch">🔄 拉取模型</button><button class="tl-btn tl-api-save">💾 保存</button><button class="tl-btn ghost tl-api-clear">🗑 清除</button></div>' +
        '<select class="tl-api-model" style="display:' + (ownCfg.model ? 'block' : 'none') + ';width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:9px;padding:8px 10px;font:inherit">' + (ownCfg.model ? '<option value="' + esc(ownCfg.model) + '" selected>' + esc(ownCfg.model) + '</option>' : '') + '</select>' +
        '<div class="tl-note">拉取 = 连通性测试（拉得到 = 地址/Key/CORS 都通），从列表里选一个再保存。嘴碎的活给便宜模型干就行。</div>' +
      '</div>' +
      '<h4>数据</h4>' +
      '<div class="tl-row"><button class="tl-btn ghost tl-set-clear">清空 ' + esc(p.name) + ' 在这个聊天里的对话</button><button class="tl-btn ghost tl-set-resetpos">小窗和球回默认位置</button></div>' +
      '<div class="tl-note">小窗抓着顶栏就能拖，松手记住位置（手机上不记）。</div>' +
      '<div class="tl-note">v' + VERSION + ' · 酒馆小狸 Live · 它说的话不进主线；只有你点了「采纳」的那一条会以一次性注入塞进下一轮。</div>';
    s.querySelector('.tl-set-x').addEventListener('click', function () { toggleSettings(false); });
    s.querySelector('.tl-set-auto').addEventListener('click', function () { settings.auto = !settings.auto; saveSettings(); renderSettings(); renderHead(); });
    s.querySelector('.tl-set-bubble').addEventListener('click', function () { settings.bubble = !settings.bubble; saveSettings(); if (!settings.bubble) hideBubble(); renderSettings(); });
    s.querySelector('.tl-set-n').addEventListener('change', function () { var n = parseInt(this.value, 10); if (n >= 1 && n <= 20) { settings.everyN = n; saveSettings(); } });
    s.querySelectorAll('.tl-set-p').forEach(function (b) { b.addEventListener('click', function () { switchPersona(this.getAttribute('data-id')); renderSettings(); }); });
    var del = s.querySelector('.tl-set-del'); if (del) del.addEventListener('click', function () {
      settings.custom = (settings.custom || []).filter(function (x) { return x.id !== p.id; });
      settings.persona = 'akuma'; saveSettings(); renderSettings(); renderAll(); toast('已请走 ' + p.name, 'warn');
    });
    s.querySelector('.tl-imp-go').addEventListener('click', function () {
      var name = s.querySelector('.tl-imp-name').value.trim();
      var emoji = s.querySelector('.tl-imp-emoji').value.trim() || '🎭';
      var desc = s.querySelector('.tl-imp-desc').value.trim();
      if (!name || !desc) { toast('名字和描述都要填', 'warn'); return; }
      importPersona(name, emoji, desc);
      renderSettings();
    });
    s.querySelector('.tl-set-clear').addEventListener('click', function () { writeLog([]); renderBody(); toast('清空了', 'ok'); });
    s.querySelector('.tl-set-resetpos').addEventListener('click', function () { settings.pos = null; settings.panelPos = null; saveSettings(); placeBall(); placePanel(); toast('回去了', 'ok'); });
    var kIn = s.querySelector('.tl-api-key'); if (kIn) kIn.addEventListener('focus', function () { kIn.removeAttribute('readonly'); });
    s.querySelector('.tl-api-fetch').addEventListener('click', async function () {
      var btn = this, u = s.querySelector('.tl-api-url').value.trim(), k = s.querySelector('.tl-api-key').value.trim();
      if (!u || !k) { toast('先填地址和 Key', 'warn'); return; }
      btn.textContent = '⏳ 拉取中…'; btn.disabled = true;
      try {
        var resp = await fetch(modelsUrlOf(u), { headers: { 'Authorization': 'Bearer ' + k } });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var j = await resp.json();
        var ids = (j.data || j.models || []).map(function (m) { return (m && (m.id || m.name)) || m; }).filter(function (x) { return typeof x === 'string'; });
        if (!ids.length) throw new Error('返回里没有模型列表');
        var sel = s.querySelector('.tl-api-model'); var cur = sel.value;
        sel.innerHTML = ids.map(function (id) { return '<option value="' + esc(id) + '"' + (id === cur ? ' selected' : '') + '>' + esc(id) + '</option>'; }).join('');
        sel.style.display = 'block';
        toast('📡 拉到 ' + ids.length + ' 个模型，选一个再保存', 'ok');
        btn.textContent = '🔄 拉取模型 (' + ids.length + ')';
      } catch (e) {
        toast('拉取失败: ' + ((e && e.message) || e) + '。多半是地址不对 / Key 无效 / 不允许浏览器直连(CORS)', 'error');
        btn.textContent = '🔄 拉取模型';
      }
      btn.disabled = false;
    });
    s.querySelector('.tl-api-save').addEventListener('click', function () {
      var u = s.querySelector('.tl-api-url').value.trim(), k = s.querySelector('.tl-api-key').value.trim(), m = s.querySelector('.tl-api-model').value;
      if (!u || !k) { toast('地址和 Key 都要填', 'warn'); return; }
      if (!m) { toast('先拉取模型再选一个', 'warn'); return; }
      try { VIEW.localStorage.setItem(API_KEY_LS, JSON.stringify({ url: u, key: k, model: m })); } catch (e) { toast('保存失败: ' + e.message, 'error'); return; }
      toast('存好了，之后小狸就走这个', 'ok'); renderSettings();
    });
    s.querySelector('.tl-api-clear').addEventListener('click', function () {
      try { VIEW.localStorage.removeItem(API_KEY_LS); } catch (e) {}
      toast('清了' + (readCfg('sbnyc_api_cfg') ? '，回落到 Sugar Baby 手机那套' : '，回落到酒馆当前连接'), 'warn'); renderSettings();
    });
  }

  // 导入 = 灵魂锚定的轻量版：保留 ta 的性格/口癖/在意的东西，把 ta 挪到第四面墙外
  function importPersona(name, emoji, desc) {
    var id = 'c_' + Date.now().toString(36);
    var colors = ['#e67e22', '#16a085', '#8e44ad', '#2980b9', '#d35400', '#27ae60', '#c0392b'];
    var voice = [
      '你是「' + name + '」。下面是关于你的资料（可能来自某张角色卡或世界书）：',
      '---', desc.slice(0, 3000), '---',
      '但此刻你**不在任何故事里**。你被请出来了，坐在<user>旁边的沙发上，看<user>玩现在这张卡。你保留自己的性格、口癖、价值观、在意的东西，用你自己的方式对眼前的剧情做反应——吐槽、嗑、看不惯、出主意、或者只是被逗笑。',
      '你知道自己是在看戏，卡里的人听不见你。你不需要假装你就是卡里的谁。如果资料里的世界观和眼前这张卡不一样，你就是一个来自别处的人在看别人的故事，这很正常，不用解释。',
      '短。像真的坐在旁边随口说话。'
    ].join('\n');
    settings.custom = settings.custom || [];
    settings.custom.push({ id: id, name: name, emoji: emoji, color: colors[settings.custom.length % colors.length], tag: '导入 · 来自别处', voice: voice, watches: '', custom: true });
    settings.persona = id; saveSettings();
    pushLog({ who: 'sys', text: emoji + ' ' + name + ' 被请出故事，坐下了。', ts: Date.now() });
    renderAll(); toast(name + ' 坐下了', 'ok');
  }

  function switchPersona(id) {
    var found = allPersonas().some(function (x) { return x.id === id; });
    if (!found) return;
    var prev = currentPersona();
    settings.persona = id; saveSettings();
    var p = currentPersona();
    if (prev.id !== p.id) hideBubble();   // 各人格自己的记录，换人只是换座位，不往对方记录里写东西
    renderAll(); scrollBottom();
  }

  /* ================================================================
     它看得到的东西：上下文采集
     ================================================================ */
  var activatedEntries = [];   // 本轮世界书触发（WORLD_INFO_ACTIVATED 抓的）
  function stripJunk(s) {
    return String(s || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/```[a-z]*\n[\s\S]*?```/gi, '[代码块]')
      .replace(/<[^>]{1,200}>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function safeJson(obj, max) {
    try {
      var s = JSON.stringify(obj, function (k, v) {
        if (typeof v === 'string' && v.length > 300) return v.slice(0, 120) + '…(' + v.length + '字)';
        if (typeof v === 'string' && /^data:image/i.test(v)) return '[图片]';
        return v;
      });
      return s.length > max ? s.slice(0, max) + '…' : s;
    } catch (e) { return ''; }
  }
  async function gatherContext(nFloors) {
    var ctx = { charName: '', charDesc: '', persona: '', preset: '', model: '', floors: 0, recent: [], vars: '', wbNames: [], wbActivated: [] };
    try { ctx.charName = (typeof getCurrentCharacterName === 'function' && getCurrentCharacterName()) || ''; } catch (e) {}
    try {
      if (typeof getCharacter === 'function') {
        var ch = await getCharacter('current');
        if (ch) { ctx.charName = ctx.charName || ch.name || ''; ctx.charDesc = stripJunk(ch.description || '').slice(0, 1800); }
      }
    } catch (e) {}
    try { if (typeof getPersona === 'function') { var pe = getPersona('current'); if (pe) ctx.persona = ((pe.name || '') + '：' + stripJunk(pe.description || '')).slice(0, 600); } } catch (e) {}
    try { if (typeof getLoadedPresetName === 'function') ctx.preset = getLoadedPresetName() || ''; } catch (e) {}
    try {
      var ST = VIEW.SillyTavern; var c = ST && ST.getContext ? ST.getContext() : null;
      if (c) {
        if (typeof c.onlineStatus === 'string') ctx.model = c.onlineStatus;
        var cs = c.chatCompletionSettings;
        if (cs && cs.chat_completion_source) {
          var src = cs.chat_completion_source;
          var m = cs[src + '_model'] || cs.model || '';
          ctx.model = (m || ctx.model || '') + (src ? ' @' + src : '');
        }
      }
    } catch (e) {}
    try {
      var last = typeof getLastMessageId === 'function' ? getLastMessageId() : -1;
      ctx.floors = last + 1;
      if (last >= 0 && typeof getChatMessages === 'function') {
        var from = Math.max(0, last - nFloors + 1);
        var msgs = getChatMessages(from + '-' + last, { hide_state: 'unhidden' }) || [];
        ctx.recent = msgs.map(function (m) {
          return { id: m.message_id, who: m.role === 'user' ? '<user>' : (m.name || '正文'), text: stripJunk(m.message).slice(0, 1400) };
        });
      }
    } catch (e) {}
    try {
      var v = getVariables({ type: 'chat' }) || {};
      var vv = {}; for (var k in v) { if (k === LOG_KEY) continue; vv[k] = v[k]; }
      if (vv.stat_data) ctx.vars = safeJson(vv.stat_data, 1600);
      else ctx.vars = safeJson(vv, 1400);
    } catch (e) {}
    try {
      if (typeof getCharWorldbookNames === 'function') { var wn = getCharWorldbookNames('current'); if (wn) { if (wn.primary) ctx.wbNames.push(wn.primary); (wn.additional || []).forEach(function (n) { ctx.wbNames.push(n); }); } }
      if (typeof getGlobalWorldbookNames === 'function') (getGlobalWorldbookNames() || []).forEach(function (n) { if (ctx.wbNames.indexOf(n) < 0) ctx.wbNames.push(n); });
    } catch (e) {}
    ctx.wbActivated = activatedEntries.slice(-12).map(function (e) {
      return { name: e.comment || e.name || (e.key && e.key.join ? e.key.join(',') : ''), text: stripJunk(e.content || '').slice(0, 220) };
    });
    return ctx;
  }
  function contextBlock(ctx) {
    var L = [];
    L.push('【你眼前的这张卡】');
    L.push('角色：' + (ctx.charName || '(未知)') + (ctx.charDesc ? '\n' + ctx.charDesc : ''));
    if (ctx.persona) L.push('<user>的 persona：' + ctx.persona);
    L.push('技术面：预设「' + (ctx.preset || '?') + '」 · 模型 ' + (ctx.model || '?') + ' · 已聊到第 ' + ctx.floors + ' 层');
    if (ctx.wbNames.length) L.push('绑定的世界书：' + ctx.wbNames.join('、'));
    if (ctx.wbActivated.length) L.push('本轮触发的世界书条目：\n' + ctx.wbActivated.map(function (e) { return '- ' + e.name + (e.text ? '：' + e.text : ''); }).join('\n'));
    if (ctx.vars) L.push('聊天变量（当前状态）：' + ctx.vars);
    if (ctx.recent.length) L.push('【最近几层正文（旧→新）】\n' + ctx.recent.map(function (m) { return '—— 第 ' + m.id + ' 层 · ' + m.who + ' ——\n' + m.text; }).join('\n\n'));
    return L.join('\n\n');
  }

  /* ================================================================
     生成
     ================================================================ */
  var busy = false, lastAutoKey = '', autoCounter = 0, pendingAuto = false;
  var RULES = [
    '【你现在的处境】你坐在<user>旁边，看<user>玩上面这张卡。你在第四面墙外面：卡里的人听不见你，你也不是卡里的谁。你直接对<user>说话（叫<user>"你"）。',
    '【怎么说】',
    '- 短。像坐旁边随口说，不是写评论。自动弹幕一共 ≤ 80 字；<user>问你问题时可以到 250 字，但仍然是说话不是写文。',
    '- 像真人发消息：想说的不止一句时可以分成 1～3 条发，每条之间空一行；每条都是一口气说完的一句或两句话。大多数时候一条就够。',
    '- 用你自己的声线。可以吐槽、嗑、瞎建议、专业建议、回答问题、或者就说"这轮没啥"。别每次都面面俱到，挑你最想说的那一件。',
    '- 你能看到技术面（预设、模型、层数、变量、世界书触发）。用得上就用，别为了显得懂而堆。',
    '- 想给剧情出主意时，把主意单独放一行、以 💡 开头、一行一条、最多 2 条、每条 ≤ 40 字（<user>可以一键把它塞进下一轮）。纯吐槽不用 💡。',
    '- 绝不替正文写正文，绝不扮演卡里的角色说台词，绝不复述正文。',
    '- 不用 markdown 标题、不用列表符号、不加"作为 AI"之类的话。纯文本。'
  ].join('\n');

  // 剥掉记忆插件/状态栏塞进来的成对 XML 块（<horae>…</horae> 之类）、HTML 注释、围栏
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function splitChunks(text) {
    var paras = String(text || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    var out = [];
    for (var i = 0; i < paras.length; i++) {
      var onlySug = paras[i].split(/\n/).every(function (l) { return /^\s*(?:💡|\[建议\]|建议[:：])/.test(l); });
      if ((onlySug && out.length) || out.length >= 4) out[out.length - 1] += '\n' + paras[i];
      else out.push(paras[i]);
    }
    return out.length ? out : [String(text || '').trim()];
  }
  function cleanReply(t) {
    t = String(t || '');
    t = t.replace(/<!--[\s\S]*?-->/g, '');
    for (var i = 0; i < 4; i++) t = t.replace(/<([A-Za-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/g, '');
    t = t.replace(/<\/?[A-Za-z][\w-]*(?:\s[^>]*)?\/?>/g, '');
    t = t.replace(/^```[a-z]*\s*\n?|\n?```\s*$/g, '');
    return t.replace(/\n{3,}/g, '\n\n').trim();
  }

  async function talk(userLine, trigger) {
    if (busy) { toast('它还在想上一句', 'warn'); return; }
    if (typeof generateRaw !== 'function') { toast('generateRaw 不可用，酒馆助手版本太老？', 'error'); return; }
    busy = true; setBusy(true);
    var p = currentPersona();
    var floor = -1;
    try { floor = typeof getLastMessageId === 'function' ? getLastMessageId() : -1; } catch (e) {}
    try {
      var ctx = await gatherContext(6);
      var log = readLog();
      var hist = log.filter(function (m) { return m.who === 'me' || m.who === 'them'; }).slice(-10).map(function (m) {
        return { role: m.who === 'me' ? 'user' : 'assistant', content: m.text };
      });
      var prompts = [
        { role: 'system', content: '【你是谁】\n' + p.voice },
        { role: 'system', content: contextBlock(ctx) },
        { role: 'system', content: RULES }
      ].concat(hist);
      var uin = userLine
        ? userLine
        : (trigger === 'poke'
            ? '（<user>戳了你一下：现在说两句。）'
            : '（正文刚出来一回合。看一眼最新那层，随口说两句——只说你最想说的那一件。这轮真没啥可说就说没啥。）');
      var A = activeApi();
      var reply;
      if (A.cfg) {
        // 独立 API：直接 fetch，OpenAI 兼容。不经过酒馆管线 → Horae 之类的记忆插件塞不进指令
        reply = await callIndependent(A.cfg, prompts.concat([{ role: 'user', content: uin }]));
      } else {
        reply = await generateRaw({
          user_input: uin,
          ordered_prompts: prompts.concat(['user_input']),
          should_silence: true,
          should_stream: false,
          max_chat_history: 0,
          generation_id: NS + '_' + Date.now()
        });
      }
      var text = (typeof reply === 'string' ? reply : (reply && reply.content) || '').trim();
      text = cleanReply(text);
      if (!text) throw new Error('空回复');
      // 0.1.10：按空行拆成几条消息，像真人连发；💡 建议行跟着它前面那条走，不单独成条；最多 4 条
      var chunks = splitChunks(text);
      for (var ci = 0; ci < chunks.length; ci++) {
        if (ci > 0) await sleep(Math.min(1800, 500 + chunks[ci].length * 40));
        pushLog({ who: 'them', pname: p.name, text: chunks[ci], floor: floor >= 0 ? floor : null, trigger: trigger, ts: Date.now() });
        renderBody(); scrollBottom();
        if (!isOpen()) { setUnread(unread + 1); showBubble(p.name, chunks[ci]); }
      }
    } catch (e) {
      var msg = (e && e.message) || String(e);
      if (/unauthorized|401|403|api key|forbidden/i.test(msg)) msg += '（认证没过 → 去 ⚙ 给小狸填一个独立 API，或先在 Sugar Baby 手机里填好它会自动读）';
      toast('🦝 小狸没说出话：' + msg.slice(0, 120), 'error');
      console.warn('[小狸Live] 生成失败', e);
    } finally {
      busy = false; setBusy(false);
      if (pendingAuto) { pendingAuto = false; if (settings.auto) setTimeout(function () { if (!busy) talk('', 'auto'); }, 600); }
    }
  }
  function ask(text) {
    pushLog({ who: 'me', text: text, ts: Date.now() });
    renderBody(); scrollBottom();
    talk(text, 'ask');
  }
  function commentNow(trigger) { talk('', trigger || 'poke'); }

  // 采纳：把某条 💡 以一次性注入塞进下一轮
  var ADOPT_ID = NS + '-adopt';
  function adopt(logIdx, sugIdx, btn) {
    var log = readLog(); var m = log[logIdx]; if (!m) return;
    var sugs = splitSuggestions(m.text).sugs; var s = sugs[sugIdx]; if (!s) return;
    var p = currentPersona();
    var content = '[幕后提示（来自玩家，不要复述、不要提及本段本身）：接下来的剧情请自然地朝这个方向推进——' + s + ']';
    try {
      uninjectPrompts([ADOPT_ID]);
      injectPrompts([{ id: ADOPT_ID, position: 'in_chat', depth: 0, role: 'system', content: content, should_scan: false }], { once: true });
      m.adopted = m.adopted || {}; m.adopted[sugIdx] = true; writeLog(log);
      if (btn) { btn.disabled = true; btn.textContent = '已采纳'; }
      toast('💡 塞进下一轮了：' + s.slice(0, 30), 'ok');
      pushLog({ who: 'sys', text: '采纳了 ' + p.name + ' 的主意：' + s, ts: Date.now() });
      renderBody(); scrollBottom();
    } catch (e) { toast('注入失败：' + (e.message || e), 'error'); }
  }

  /* ================================================================
     事件
     ================================================================ */
  var H = {};
  function bindEvents() {
    try {
      H.wi = function (entries) { try { activatedEntries = Array.isArray(entries) ? entries.slice(0, 40) : []; } catch (e) {} };
      eventOn(tavern_events.WORLD_INFO_ACTIVATED, H.wi);
    } catch (e) {}
    try {
      H.gen = function () {
        if (!settings.auto) return;
        // 只在正文楼层真的变了才说（防 swipe/自己的 generateRaw 触发）
        var lastId = -1, key = '';
        try {
          lastId = getLastMessageId();
          var ms = getChatMessages(lastId, { include_swipes: true }) || [];
          var lm = ms[0];
          if (!lm || lm.role === 'user') return;
          key = lastId + ':' + (typeof lm.swipe_id === 'number' ? lm.swipe_id : 0);
        } catch (e) { return; }
        if (key === lastAutoKey) return;
        lastAutoKey = key;
        autoCounter++;
        if (autoCounter % Math.max(1, settings.everyN) !== 0) { console.log('[小狸Live] 这层跳过（每 ' + settings.everyN + ' 层说一次）'); return; }
        // 0.1.12：它还在说上一句时新正文就出来了 → 以前直接丢掉这轮（Fan："不会每轮稳定出"），现在记一笔，说完立刻补
        if (busy) { pendingAuto = true; console.log('[小狸Live] 它还在说上一句，这层排队，说完补'); return; }
        setTimeout(function () { if (!busy) talk('', 'auto'); else pendingAuto = true; }, 900);
      };
      eventOn(tavern_events.GENERATION_ENDED, H.gen);
    } catch (e) {}
    try {
      H.chat = function () { activatedEntries = []; lastAutoKey = ''; autoCounter = 0; pendingAuto = false; setUnread(0); if (mounted) { renderBody(); } };
      eventOn(tavern_events.CHAT_CHANGED, H.chat);
    } catch (e) {}
    try {
      H.btn = function () { if (!mounted) mount(); var open = isOpen(); placeBall(); setOpen(!open); if (!open) setUnread(0); };
      if (typeof replaceScriptButtons === 'function') replaceScriptButtons([{ name: BTN, visible: true }]);
      eventOn(getButtonEvent(BTN), H.btn);
    } catch (e) {}
    try {
      H.key = function (e) { if (e.key === 'Escape' && isOpen()) setOpen(false); };
      DOC.addEventListener('keydown', H.key);
    } catch (e) {}
  }
  function unbindEvents() {
    try { if (H.wi) eventOff(tavern_events.WORLD_INFO_ACTIVATED, H.wi); } catch (e) {}
    try { if (H.gen) eventOff(tavern_events.GENERATION_ENDED, H.gen); } catch (e) {}
    try { if (H.chat) eventOff(tavern_events.CHAT_CHANGED, H.chat); } catch (e) {}
    try { if (H.btn) eventOff(getButtonEvent(BTN), H.btn); } catch (e) {}
    try { if (H.key) DOC.removeEventListener('keydown', H.key); } catch (e) {}
    H = {};
  }

  /* ================================================================
     清理：挂到 parent 上的东西必须自己收
     ================================================================ */
  var cleaned = false;
  function cleanup() {
    if (cleaned) return; cleaned = true;
    unbindEvents();
    unmount();
    if (vvBound) {
      try { if (VIEW.visualViewport) VIEW.visualViewport.removeEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.removeEventListener('resize', vvBound); } catch (e) {}
      try { VIEW.removeEventListener('orientationchange', vvBound); } catch (e) {}
      vvBound = null;
    }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (kvTimer) { clearTimeout(kvTimer); kvTimer = null; }
    try { uninjectPrompts([ADOPT_ID]); } catch (e) {}
    if (VIEW[INSTANCE_KEY] === cleanup) VIEW[INSTANCE_KEY] = null;
    console.log('[小狸Live] 收拾干净走了');
  }
  VIEW[INSTANCE_KEY] = cleanup;
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('unload', cleanup);

  /* ================================================================
     启动
     ================================================================ */
  bindEvents();
  mount();
  console.log('%c🦝 酒馆小狸 Live %cv' + VERSION + ' · ' + currentPersona().emoji + ' ' + currentPersona().name + ' 坐下了',
    'font-weight:700;color:#fff;background:#e85d75;padding:3px 8px;border-radius:4px 0 0 4px',
    'color:#ddd;background:#1a1a2e;padding:3px 8px;border-radius:0 4px 4px 0');
})();
