import type { ComicStyle } from "@/lib/types";

/** 预设角色模板 */
export interface CharacterPreset {
  name: string;
  description: string;
  appearance: {
    gender: string;
    age: string;
    hair: string;
    eyes: string;
    clothing: string;
  };
  style: ComicStyle;
  tags: string[];
}

/** 内置预设角色库 */
export const CHARACTER_PRESETS: CharacterPreset[] = [
  {
    name: "科普博士",
    description: "友善的科学家形象，用通俗语言讲解复杂知识",
    appearance: {
      gender: "男",
      age: "中年",
      hair: "灰白短发，微卷",
      eyes: "圆框眼镜，温和目光",
      clothing: "白色实验服，蓝色领带",
    },
    style: "flat",
    tags: ["科普", "教师", "科学家"],
  },
  {
    name: "古风侠客",
    description: "飘逸潇洒的古代侠客，行走江湖",
    appearance: {
      gender: "男",
      age: "青年",
      hair: "黑色长发束起，额上飘带",
      eyes: "剑眉星目，目光锐利",
      clothing: "白色劲装，腰佩长剑，深色披风",
    },
    style: "inkwash",
    tags: ["古风", "武侠", "男性"],
  },
  {
    name: "汉服少女",
    description: "温婉典雅的古典少女",
    appearance: {
      gender: "女",
      age: "少女",
      hair: "黑色长发，半挽云鬟，插玉簪",
      eyes: "柳叶眉，杏仁眼，明亮灵动",
      clothing: "淡粉色齐胸襦裙，白色披帛飘带",
    },
    style: "watercolor",
    tags: ["古风", "诗词", "女性"],
  },
  {
    name: "赛博少年",
    description: "霓虹都市中的未来少年",
    appearance: {
      gender: "男",
      age: "少年",
      hair: "蓝紫色短发，发尾渐变荧光",
      eyes: "电子义眼，瞳孔发出淡蓝光芒",
      clothing: "黑色机能风夹克，荧光管线装饰",
    },
    style: "anime",
    tags: ["科幻", "赛博朋克", "男性"],
  },
  {
    name: "萌宠猫咪",
    description: "圆滚滚的拟人化小猫",
    appearance: {
      gender: "中性",
      age: "幼年",
      hair: "橘色短毛，头顶呆毛翘起",
      eyes: "大圆眼，翠绿色，永远好奇的表情",
      clothing: "小围巾，铃铛项圈",
    },
    style: "chibi",
    tags: ["Q版", "动物", "萌系"],
  },
  {
    name: "小红书博主",
    description: "时尚自信的都市女性",
    appearance: {
      gender: "女",
      age: "青年",
      hair: "栗色波浪长发，空气刘海",
      eyes: "大眼，精致妆容，自信笑容",
      clothing: "时尚休闲穿搭，针织衫配阔腿裤",
    },
    style: "infographic",
    tags: ["小红书", "时尚", "女性"],
  },
];
