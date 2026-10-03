export const INCIDENT_LABEL: Record<string, string> = {
  late_checkout: '延迟退房',
  room_fault: '房间硬件故障',
  linen_delay: '布草未及时送达',
  extra_guest: '客人临时加人',
  pet_damage: '宠物损坏家具',
  breakfast_shortage: '早餐供应不足',
  oversell: '渠道超卖',
  bad_review: '客人差评',
};

export const INCIDENT_COLOR: Record<string, string> = {
  late_checkout: 'orange',
  room_fault: 'red',
  linen_delay: 'gold',
  extra_guest: 'blue',
  pet_damage: 'volcano',
  breakfast_shortage: 'orange',
  oversell: 'red',
  bad_review: 'magenta',
};

export const REVIEW_CATEGORY: Record<string, string> = {
  hardware: '硬件设施',
  service: '服务质量',
  oversell: '超卖/履约',
  food_prep: '餐食准备',
  other: '其他',
};

export const REVIEW_CATEGORY_COLOR: Record<string, string> = {
  hardware: 'red',
  service: 'blue',
  oversell: 'volcano',
  food_prep: 'orange',
  other: 'default',
};

export const BOOKING_STATUS: Record<string, { label: string; color: string }> = {
  reserved: { label: '已预订', color: 'blue' },
  checked_in: { label: '在住', color: 'green' },
  checked_out: { label: '已离店', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  no_show: { label: '未到店', color: 'warning' },
};

export const CLEAN_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待打扫', color: 'gold' },
  in_progress: { label: '打扫中', color: 'blue' },
  blocked: { label: '阻塞', color: 'red' },
  done: { label: '已完成', color: 'green' },
};

export const BLOCK_REASON: Record<string, string> = {
  delayed_checkout: '上一位客人延迟退房',
  linen_shortage: '布草不足/未送达',
  maintenance: '房间维修中',
};

export const COMP_KIND: Record<string, { label: string; color: string }> = {
  coupon: { label: '补偿券', color: 'purple' },
  refund: { label: '退款', color: 'orange' },
  upgrade: { label: '房型升级', color: 'blue' },
  cash: { label: '现金赔付', color: 'red' },
  deposit_deduction: { label: '押金扣除', color: 'volcano' },
};

export const MAINT_CATEGORY: Record<string, string> = {
  ac: '空调',
  plumbing: '卫浴水管',
  furniture: '家具',
  electrical: '电路电器',
  other: '其他',
};

export const BREAKFAST_STATUS: Record<string, { label: string; color: string }> = {
  planned: { label: '待制作', color: 'default' },
  prepared: { label: '已制作', color: 'blue' },
  served: { label: '已供应', color: 'green' },
  shortage: { label: '供应不足', color: 'red' },
};
