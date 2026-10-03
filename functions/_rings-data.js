// Original sample content. English names are authoritative; Chinese is a reading aid.
const pairs = `Apple|苹果
Banana|香蕉
Orange|橙子
Pear|梨
Peach|桃子
Grape|葡萄
Lemon|柠檬
Watermelon|西瓜
Strawberry|草莓
Pineapple|菠萝
Carrot|胡萝卜
Potato|土豆
Tomato|番茄
Onion|洋葱
Mushroom|蘑菇
Bread|面包
Cheese|奶酪
Egg|鸡蛋
Milk|牛奶
Rice|米饭
Noodle|面条
Cookie|曲奇
Cake|蛋糕
Chocolate|巧克力
Honey|蜂蜜
Salt|盐
Coffee|咖啡
Tea|茶
Water|水
Ice|冰
Spoon|勺子
Fork|叉子
Knife|刀
Plate|盘子
Bowl|碗
Cup|杯子
Bottle|瓶子
Kettle|水壶
Pan|平底锅
Oven|烤箱
Refrigerator|冰箱
Microwave|微波炉
Table|桌子
Chair|椅子
Sofa|沙发
Bed|床
Pillow|枕头
Blanket|毯子
Lamp|台灯
Mirror|镜子
Clock|时钟
Window|窗户
Door|门
Key|钥匙
Lock|锁
Umbrella|雨伞
Backpack|背包
Wallet|钱包
Suitcase|行李箱
Glasses|眼镜
Hat|帽子
Shirt|衬衫
Coat|外套
Shoe|鞋
Sock|袜子
Glove|手套
Scarf|围巾
Belt|腰带
Ring|戒指
Watch|手表
Phone|手机
Computer|电脑
Keyboard|键盘
Mouse|鼠标
Screen|屏幕
Camera|相机
Speaker|扬声器
Headphones|耳机
Battery|电池
Cable|电线
Book|书
Notebook|笔记本
Pencil|铅笔
Pen|笔
Eraser|橡皮
Ruler|尺子
Scissors|剪刀
Paper|纸
Envelope|信封
Stamp|邮票
Ball|球
Kite|风筝
Balloon|气球
Puzzle|拼图
Dice|骰子
Guitar|吉他
Piano|钢琴
Drum|鼓
Flute|长笛
Violin|小提琴
Bicycle|自行车
Car|汽车
Bus|公共汽车
Train|火车
Airplane|飞机
Boat|船
Truck|卡车
Helicopter|直升机
Wheel|轮子
Helmet|头盔
Dog|狗
Cat|猫
Rabbit|兔子
Horse|马
Cow|牛
Pig|猪
Sheep|羊
Duck|鸭子
Chicken|鸡
Fish|鱼
Shark|鲨鱼
Whale|鲸鱼
Dolphin|海豚
Turtle|乌龟
Snake|蛇
Frog|青蛙
Butterfly|蝴蝶
Bee|蜜蜂
Ant|蚂蚁
Spider|蜘蛛
Lion|狮子
Tiger|老虎
Elephant|大象
Giraffe|长颈鹿
Bear|熊
Penguin|企鹅
Owl|猫头鹰
Eagle|鹰
Feather|羽毛
Shell|贝壳
Tree|树
Flower|花
Leaf|叶子
Grass|草
Seed|种子
Rock|石头
Sand|沙子
Mountain|山
River|河流
Lake|湖
Ocean|海洋
Cloud|云
Rain|雨
Snow|雪
Sun|太阳
Moon|月亮
Star|星星
Fire|火
Smoke|烟
Rainbow|彩虹
Hammer|锤子
Nail|钉子
Screw|螺丝
Ladder|梯子
Rope|绳子
Brush|刷子
Broom|扫帚
Bucket|桶
Soap|肥皂
Towel|毛巾
Toothbrush|牙刷
Comb|梳子
Candle|蜡烛
Match|火柴
Tent|帐篷
Map|地图
Compass|指南针
Ticket|票
Coin|硬币
Flag|旗帜`;

export const CARDS = pairs.split('\n').map((line, i) => {
  const [en, zh] = line.split('|');
  return { id: `thing-${i + 1}`, en, zh };
});

export const RULES = {
  attribute: [
    ['Usually fits in one hand', '通常能握在一只手里'],
    ['Usually contains metal', '通常含有金属'],
    ['Usually contains wood', '通常含有木材'],
    ['Is a living thing', '是生物'],
    ['Can be eaten or drunk', '可以吃或喝'],
    ['Usually needs electricity to work', '通常需要电才能工作'],
    ['Usually has wheels', '通常有轮子'],
    ['Usually feels soft', '通常摸起来柔软'],
    ['Usually heavier than a chair', '通常比椅子重'],
    ['Usually has a hollow space', '通常有中空的空间'],
    ['Can usually float on water', '通常能浮在水面上'],
    ['Usually breaks if dropped from a table', '通常从桌上掉下会破损']
  ],
  word: [
    ['Contains the letter A', '英文名含字母 A'],
    ['Contains the letter E', '英文名含字母 E'],
    ['Contains the letter R', '英文名含字母 R'],
    ['Contains the letter O', '英文名含字母 O'],
    ['Has exactly five letters', '英文名恰好有 5 个字母'],
    ['Has six or more letters', '英文名有 6 个或更多字母'],
    ['Has four or fewer letters', '英文名有 4 个或更少字母'],
    ['Starts with a vowel (A, E, I, O, U)', '英文名以元音字母开头（A、E、I、O、U）'],
    ['Ends with a consonant', '英文名以辅音字母结尾'],
    ['Contains a repeated letter', '英文名有重复出现的字母'],
    ['Contains two adjacent identical letters', '英文名有两个相邻的相同字母'],
    ['Contains at least three vowel letters', '英文名含至少 3 个元音字母（按出现次数计）']
  ],
  context: [
    ['Commonly found in a kitchen', '常见于厨房'],
    ['Commonly found at school', '常见于学校'],
    ['Commonly found outdoors', '常见于户外'],
    ['Commonly found in a bedroom', '常见于卧室'],
    ['Commonly sold in a supermarket', '常见于超市售卖'],
    ['Commonly used when traveling', '旅行时常用'],
    ['Commonly used for entertainment', '常用于娱乐'],
    ['Commonly used to make something', '常用于制作东西'],
    ['Usually made by people', '通常由人制造'],
    ['Commonly worn or carried', '常被穿戴或随身携带'],
    ['Commonly associated with water', '常与水有关'],
    ['Commonly given as a gift', '常被作为礼物赠送']
  ]
};

export function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomRules() {
  return Object.fromEntries(Object.entries(RULES).map(([key, list]) => {
    const [en, zh] = shuffle(list)[0];
    return [key, { en, zh }];
  }));
}
