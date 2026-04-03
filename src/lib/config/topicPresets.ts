import type { BuiltinContentType } from "@/lib/types";

export interface TopicPreset {
  label: string;
  topic: string;
  category: string;
}

export const TOPIC_PRESETS: Record<BuiltinContentType, TopicPreset[]> = {
  science: [
    // 天文 (8)
    { label: "太阳系", topic: "太阳系的八大行星", category: "天文" },
    { label: "黑洞", topic: "黑洞的形成与特性", category: "天文" },
    { label: "宇宙大爆炸", topic: "宇宙大爆炸理论", category: "天文" },
    { label: "月球", topic: "月球的起源与地球的关系", category: "天文" },
    { label: "恒星演化", topic: "恒星从诞生到消亡的生命周期", category: "天文" },
    { label: "银河系", topic: "银河系的结构与组成", category: "天文" },
    { label: "彗星", topic: "彗星的轨道与尾巴的形成", category: "天文" },
    { label: "系外行星", topic: "寻找太阳系外的宜居行星", category: "天文" },
    // 生物 (8)
    { label: "DNA", topic: "DNA双螺旋结构与基因遗传", category: "生物" },
    { label: "光合作用", topic: "植物光合作用的过程", category: "生物" },
    { label: "人体免疫", topic: "人体免疫系统如何对抗病毒", category: "生物" },
    { label: "进化论", topic: "达尔文进化论与自然选择", category: "生物" },
    { label: "细胞分裂", topic: "有丝分裂与减数分裂的过程", category: "生物" },
    { label: "蜜蜂社会", topic: "蜜蜂的社会结构与分工", category: "生物" },
    { label: "恐龙灭绝", topic: "恐龙灭绝的原因与证据", category: "生物" },
    { label: "深海生物", topic: "深海极端环境中的奇异生物", category: "生物" },
    // 物理 (7)
    { label: "量子力学", topic: "量子力学的基本原理", category: "物理" },
    { label: "相对论", topic: "爱因斯坦相对论的核心思想", category: "物理" },
    { label: "电磁波", topic: "电磁波的种类与应用", category: "物理" },
    { label: "核聚变", topic: "核聚变：太阳的能量来源", category: "物理" },
    { label: "声音传播", topic: "声音是如何产生和传播的", category: "物理" },
    { label: "超导体", topic: "超导体的原理与未来应用", category: "物理" },
    { label: "薛定谔的猫", topic: "薛定谔的猫与量子叠加态", category: "物理" },
    // 化学 (6)
    { label: "元素周期表", topic: "化学元素周期表的发现", category: "化学" },
    { label: "水的三态", topic: "水的三态变化与分子运动", category: "化学" },
    { label: "燃烧反应", topic: "燃烧的本质与条件", category: "化学" },
    { label: "酸碱反应", topic: "日常生活中的酸碱反应", category: "化学" },
    { label: "高分子材料", topic: "塑料和高分子材料的化学原理", category: "化学" },
    { label: "催化剂", topic: "催化剂如何加速化学反应", category: "化学" },
    // 地理 (6)
    { label: "板块构造", topic: "地球板块构造与大陆漂移", category: "地理" },
    { label: "火山喷发", topic: "火山喷发的原因与影响", category: "地理" },
    { label: "洋流", topic: "全球洋流系统与气候影响", category: "地理" },
    { label: "地震", topic: "地震的成因与预测", category: "地理" },
    { label: "冰川", topic: "冰川的形成与全球变暖", category: "地理" },
    { label: "大气层", topic: "地球大气层的分层结构", category: "地理" },
    // 科技 (8)
    { label: "人工智能", topic: "人工智能的发展历程", category: "科技" },
    { label: "区块链", topic: "区块链技术的原理与应用", category: "科技" },
    { label: "芯片制造", topic: "芯片是如何制造出来的", category: "科技" },
    { label: "5G通信", topic: "5G通信技术的原理与未来", category: "科技" },
    { label: "量子计算", topic: "量子计算机与传统计算机的区别", category: "科技" },
    { label: "火箭发射", topic: "火箭发射的基本原理", category: "科技" },
    { label: "3D打印", topic: "3D打印技术的原理与应用", category: "科技" },
    { label: "基因编辑", topic: "CRISPR基因编辑技术", category: "科技" },
    // 数学 (4)
    { label: "圆周率", topic: "圆周率π的历史与奥秘", category: "数学" },
    { label: "斐波那契", topic: "斐波那契数列与自然界的联系", category: "数学" },
    { label: "无穷大", topic: "数学中的无穷大概念", category: "数学" },
    { label: "概率论", topic: "概率论在日常生活中的应用", category: "数学" },
    // 医学 (5)
    { label: "疫苗原理", topic: "疫苗如何保护我们", category: "医学" },
    { label: "抗生素", topic: "抗生素的发现与耐药性危机", category: "医学" },
    { label: "血液循环", topic: "人体血液循环系统", category: "医学" },
    { label: "大脑", topic: "人类大脑的结构与功能", category: "医学" },
    { label: "睡眠科学", topic: "为什么我们需要睡眠", category: "医学" },
  ],
  poetry: [
    // 唐诗 (10)
    { label: "静夜思", topic: "床前明月光，疑是地上霜。举头望明月，低头思故乡。", category: "唐诗/李白" },
    { label: "春晓", topic: "春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。", category: "唐诗/孟浩然" },
    { label: "登鹳雀楼", topic: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。", category: "唐诗/王之涣" },
    { label: "望庐山瀑布", topic: "日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。", category: "唐诗/李白" },
    { label: "春望", topic: "国破山河在，城春草木深。感时花溅泪，恨别鸟惊心。", category: "唐诗/杜甫" },
    { label: "枫桥夜泊", topic: "月落乌啼霜满天，江枫渔火对愁眠。姑苏城外寒山寺，夜半钟声到客船。", category: "唐诗/张继" },
    { label: "送元二", topic: "渭城朝雨浥轻尘，客舍青青柳色新。劝君更尽一杯酒，西出阳关无故人。", category: "唐诗/王维" },
    { label: "江雪", topic: "千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。", category: "唐诗/柳宗元" },
    { label: "回乡偶书", topic: "少小离家老大回，乡音无改鬓毛衰。儿童相见不相识，笑问客从何处来。", category: "唐诗/贺知章" },
    { label: "游子吟", topic: "慈母手中线，游子身上衣。临行密密缝，意恐迟迟归。谁言寸草心，报得三春晖。", category: "唐诗/孟郊" },
    // 宋词 (6)
    { label: "水调歌头", topic: "明月几时有，把酒问青天。不知天上宫阙，今夕是何年。", category: "宋词/苏轼" },
    { label: "如梦令", topic: "昨夜雨疏风骤，浓睡不消残酒。试问卷帘人，却道海棠依旧。知否，知否，应是绿肥红瘦。", category: "宋词/李清照" },
    { label: "念奴娇·赤壁", topic: "大江东去，浪淘尽，千古风流人物。故垒西边，人道是，三国周郎赤壁。", category: "宋词/苏轼" },
    { label: "满江红", topic: "怒发冲冠，凭栏处、潇潇雨歇。抬望眼，仰天长啸，壮怀激烈。", category: "宋词/岳飞" },
    { label: "虞美人", topic: "春花秋月何时了，往事知多少。小楼昨夜又东风，故国不堪回首月明中。", category: "宋词/李煜" },
    { label: "青玉案·元夕", topic: "东风夜放花千树，更吹落、星如雨。宝马雕车香满路。", category: "宋词/辛弃疾" },
    // 其他 (4)
    { label: "观沧海", topic: "东临碣石，以观沧海。水何澹澹，山岛竦峙。", category: "汉魏/曹操" },
    { label: "归园田居", topic: "种豆南山下，草盛豆苗稀。晨兴理荒秽，带月荷锄归。", category: "魏晋/陶渊明" },
    { label: "天净沙·秋思", topic: "枯藤老树昏鸦，小桥流水人家，古道西风瘦马。夕阳西下，断肠人在天涯。", category: "元曲/马致远" },
    { label: "再别康桥", topic: "轻轻的我走了，正如我轻轻的来；我轻轻的招手，作别西天的云彩。", category: "现代/徐志摩" },
  ],
  novel: [
    // 武侠 (3)
    { label: "武侠·山中秘籍", topic: "一位少年在山中偶得一本古老剑谱", category: "武侠" },
    { label: "武侠·江湖恩怨", topic: "两大门派之间的恩怨纠葛在一场武林大会上爆发", category: "武侠" },
    { label: "武侠·退隐高手", topic: "一位隐居多年的剑客被迫重出江湖", category: "武侠" },
    // 科幻 (3)
    { label: "科幻·火星城市", topic: "2150年，人类在火星建立了第一座城市", category: "科幻" },
    { label: "科幻·时间旅行", topic: "一名物理学家意外发现了时间倒流的方法", category: "科幻" },
    { label: "科幻·AI觉醒", topic: "一台超级计算机突然产生了自我意识", category: "科幻" },
    // 悬疑 (3)
    { label: "悬疑·匿名信", topic: "雨夜，一封没有署名的信出现在侦探办公室", category: "悬疑" },
    { label: "悬疑·密室", topic: "一座古老庄园中发生了不可能的密室杀人案", category: "悬疑" },
    { label: "悬疑·消失的画", topic: "博物馆中一幅名画在众目睽睽下消失了", category: "悬疑" },
    // 奇幻 (3)
    { label: "奇幻·魔法学院", topic: "一个普通少年收到了来自魔法学院的录取通知", category: "奇幻" },
    { label: "奇幻·龙的契约", topic: "最后一条龙与一位牧羊女结下了灵魂契约", category: "奇幻" },
    { label: "奇幻·失落王国", topic: "地图上不存在的岛屿隐藏着一个远古王国", category: "奇幻" },
    // 言情 (2)
    { label: "言情·旧书店", topic: "她在一家旧书店里发现了一封写给自己的信", category: "言情" },
    { label: "言情·重逢", topic: "十年后在异国他乡的咖啡馆里意外重逢", category: "言情" },
    // 历史 (2)
    { label: "历史·丝绸之路", topic: "一位唐代商人踏上了通往西域的漫长旅途", category: "历史" },
    { label: "历史·诸葛亮", topic: "诸葛亮在草庐中等待那位三顾茅庐的人", category: "历史" },
  ],
  xiaohongshu: [
    // 美妆 (3)
    { label: "护肤攻略", topic: "秋冬换季护肤攻略", category: "美妆" },
    { label: "口红试色", topic: "2024秋冬必入口红色号推荐", category: "美妆" },
    { label: "平价护肤", topic: "学生党百元以内平价护肤好物", category: "美妆" },
    // 时尚 (3)
    { label: "显高穿搭", topic: "小个子女生显高穿搭", category: "时尚" },
    { label: "通勤穿搭", topic: "极简通勤穿搭一周不重样", category: "时尚" },
    { label: "配色指南", topic: "秋冬高级感配色指南", category: "时尚" },
    // 美食 (3)
    { label: "一人食", topic: "一人食简单晚餐食谱", category: "美食" },
    { label: "减脂餐", topic: "好吃不胖的减脂午餐便当", category: "美食" },
    { label: "烘焙入门", topic: "零失败新手烘焙教程", category: "美食" },
    // 旅行 (3)
    { label: "周末游", topic: "周末两天一夜周边游攻略", category: "旅行" },
    { label: "拍照打卡", topic: "最出片的城市拍照打卡地", category: "旅行" },
    { label: "旅行收纳", topic: "行李箱收纳技巧大公开", category: "旅行" },
    // 生活 (4)
    { label: "房间改造", topic: "租房低成本房间改造", category: "生活" },
    { label: "自律习惯", topic: "改变人生的10个自律小习惯", category: "生活" },
    { label: "养花入门", topic: "新手养花不死指南", category: "生活" },
    { label: "早起计划", topic: "5点早起的一天是怎样的", category: "生活" },
  ],
  wikipedia: [
    // 物理 (3)
    { label: "相对论", topic: "Theory of Relativity", category: "物理" },
    { label: "量子纠缠", topic: "Quantum entanglement", category: "物理" },
    { label: "暗物质", topic: "Dark matter", category: "物理" },
    // 生物 (3)
    { label: "人体免疫系统", topic: "Immune system", category: "生物" },
    { label: "基因组", topic: "Human genome", category: "生物" },
    { label: "光合作用", topic: "Photosynthesis", category: "生物" },
    // 历史 (3)
    { label: "文艺复兴", topic: "Renaissance", category: "历史" },
    { label: "工业革命", topic: "Industrial Revolution", category: "历史" },
    { label: "丝绸之路", topic: "Silk Road", category: "历史" },
    // 计算机 (3)
    { label: "互联网", topic: "Internet", category: "计算机" },
    { label: "人工智能", topic: "Artificial intelligence", category: "计算机" },
    { label: "图灵机", topic: "Turing machine", category: "计算机" },
    // 天文 (2)
    { label: "黑洞", topic: "Black hole", category: "天文" },
    { label: "太阳系", topic: "Solar System", category: "天文" },
    // 艺术 (2)
    { label: "蒙娜丽莎", topic: "Mona Lisa", category: "艺术" },
    { label: "贝多芬", topic: "Ludwig van Beethoven", category: "艺术" },
  ],
};

/** Get unique categories for a content type */
export function getCategories(contentType: BuiltinContentType): string[] {
  const presets = TOPIC_PRESETS[contentType];
  if (!presets) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of presets) {
    const cat = p.category.split("/")[0]; // "唐诗/李白" -> "唐诗"
    if (!seen.has(cat)) {
      seen.add(cat);
      result.push(cat);
    }
  }
  return result;
}
