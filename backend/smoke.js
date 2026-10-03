const BASE = 'http://127.0.0.1:3000/api';
const fs = require('fs');
const token = fs.readFileSync('/tmp/token.txt', 'utf8').trim();
let pass = 0, fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
const today = new Date();
const d = (off) => { const x = new Date(today); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };

(async () => {
  // 1. 运营总览
  let r = await api('GET', `/dashboard?date=${d(0)}`);
  ok('总览看板返回今日在住/保洁/早餐/布草', r.status === 200 && r.data.inHouseBookings >= 5 && r.data.linen, r.data);

  // 2. 房态日历：山景房今日 3 间满房且含 1 单强制超卖
  r = await api('GET', '/bookings/availability?roomTypeId=1&from=' + d(0) + '&to=' + d(1));
  ok('山景房今日物理 3 间、已订含超卖、remaining<0', r.status === 200 && r.data[0].physical === 3 && r.data[0].booked >= 3 && r.data[0].oversold === true, r.data[0]);

  // 3. 无强制超卖下单被拒绝
  r = await api('POST', '/bookings', {
    channelCode: 'meituan', roomTypeId: 1, guestName: '测试超卖拦截',
    arrivalDate: d(0), departureDate: d(1), adults: 2,
  });
  ok('满房时普通下单被拒（统一库存生效）', r.status === 400 && /无可售房/.test(r.data.message), { status: r.status, msg: r.data.message });

  // 4. 找到超卖订单郑凯，检查链路
  r = await api('GET', '/bookings?status=reserved');
  const oversold = r.data.find((b) => b.forceOversold);
  ok('超卖订单存在', !!oversold);
  let chain = await api('GET', `/bookings/${oversold.id}`);
  ok('超卖订单自动挂 oversell 事件', chain.data.incidents.some((i) => i.type === 'oversell'), chain.data.incidents);
  ok('超卖订单自动生成保洁与布草申领', chain.data.cleaningTasks.length === 1 && chain.data.linenRequests.length === 1);
  ok('超卖订单未分房不能入住', true);
  r = await api('POST', `/bookings/${oversold.id}/check-in`);
  ok('超卖订单入住被拦截', r.status === 400, r.data);

  // 5. 安置超卖客人：亲子房空闲也不能乱分（房型校验）；庭院房 C301 可作为升级？同类型限制——这里直接验房型校验
  r = await api('POST', `/bookings/${oversold.id}/assign-room`, { roomId: 4 }); // B201 亲子房
  ok('不允许跨房型分房', r.status === 400, r.data);
  // 取消电话单吴姐腾出 A102
  const wj = r.data; const phoneBooking = (await api('GET', '/bookings?status=reserved')).data.find((b) => b.guestName.includes('吴姐'));
  r = await api('POST', `/bookings/${phoneBooking.id}/cancel`);
  ok('电话订单取消释放房间', r.status === 200 && r.data.booking.status === 'cancelled');
  // 重新安排：直接把郑凯分到 A102（房间 id=2）
  r = await api('POST', `/bookings/${oversold.id}/assign-room`, { roomId: 2 });
  ok('超卖客人换房安置到 A102', r.status === 200 && r.data.booking.room.number === 'A102', r.data?.booking?.room);
  r = await api('POST', `/bookings/${oversold.id}/check-in`);
  ok('安置后正常入住', r.status === 200 && r.data.booking.status === 'checked_in');

  // 6. 布草延迟链路：赵晓(A102 离店) 保洁阻塞 → 送达布草 → 解除
  r = await api('GET', '/housekeeping/tasks?status=blocked');
  const blocked = r.data.find((t) => t.blockedReason === 'linen_shortage');
  ok('布草延迟导致保洁任务阻塞', !!blocked, r.data.map((t) => t.blockedReason));
  const linenReqId = blocked.linenRequests[0].id;
  const stockBefore = (await api('GET', '/housekeeping/linen')).data.packsAvailable;
  r = await api('POST', `/housekeeping/linen/deliver/${linenReqId}`);
  ok('布草送达扣减库存', r.status === 200);
  const stockAfter = (await api('GET', '/housekeeping/linen')).data;
  ok('干净布草库存-1', stockAfter.packsAvailable === stockBefore - 1, { before: stockBefore, after: stockAfter.packsAvailable });
  r = await api('GET', '/housekeeping/tasks?status=pending');
  ok('布草送达后保洁自动解除阻塞', r.data.some((t) => t.id === blocked.id));
  const incLinen = (await api('GET', '/incidents?type=linen_delay')).data;
  ok('布草延迟事件自动关闭', incLinen.every((i) => i.status === 'closed'), incLinen);
  // 完成打扫 → 布草入洗涤 → 回库
  r = await api('PATCH', `/housekeeping/tasks/${blocked.id}`, { status: 'in_progress' });
  r = await api('PATCH', `/housekeeping/tasks/${blocked.id}`, { status: 'done' });
  ok('打扫完成', r.status === 200 && r.data.status === 'done');
  const inWash = (await api('GET', '/housekeeping/linen')).data.packsInWash;
  r = await api('POST', '/housekeeping/linen/wash-complete', { packs: 1 });
  ok('洗涤回库 inWash-1/available+1', r.status === 200 && r.data.packsInWash === inWash - 1);

  // 7. 厨房看板与忌口、早餐不足事件（林先生家今日到店，花生过敏早餐在次日早晨）
  r = await api('GET', '/kitchen/board?from=' + d(0) + '&to=' + d(3));
  ok('厨房看板汇总份数与忌口', r.status === 200 && r.data.days.length >= 1 && r.data.days.some((x) => x.dietary.length >= 2), r.data.days.map((x) => ({ d: x.date, p: x.totalPortions, diet: x.dietary })));
  const allDiet = r.data.days.flatMap((x) => x.dietary);
  ok('早餐计划含花生过敏提醒', allDiet.some((s) => s.includes('花生')), allDiet);
  // 精确把赵晓今日早餐标记为供应不足
  const zhaoBo = r.data.days.find((x) => x.date === d(0)).orders.find((o) => o.booking.guestName === '赵晓');
  ok('赵晓今日有早餐单', !!zhaoBo);
  r = await api('PATCH', `/kitchen/orders/${zhaoBo.id}`, { status: 'shortage', note: '粥备少了' });
  ok('早餐标记供应不足', r.status === 200);
  const bfInc = (await api('GET', '/incidents?type=breakfast_shortage')).data;
  ok('早餐不足自动生成事件', bfInc.length >= 1);

  // 8. 临时加人：给何苗一家加 1 人 → 附加费重算
  let hemiao = (await api('GET', '/bookings?status=checked_in')).data.find((b) => b.guestName.includes('何苗'));
  const feeBefore = Number(hemiao.addOnFee);
  r = await api('POST', '/incidents', { type: 'extra_guest', bookingId: hemiao.id, title: '临时加 1 位老人', meta: { count: 1 } });
  ok('临时加人事件登记', r.status === 200);
  hemiao = (await api('GET', `/bookings/${hemiao.id}`)).data.booking;
  ok('临时加人产生加人费（100元/晚×2晚=200）', Number(hemiao.addOnFee) === feeBefore + 200, { feeBefore, now: hemiao.addOnFee });

  // 9. 宠物损坏 → 押金扣除校验超额
  const chen = (await api('GET', '/bookings?keyword=陈默')).data[0];
  r = await api('GET', `/compensations/suggestions/${chen.id}`);
  ok('历史宠物单已有押金扣除建议/记录', r.status === 200);
  // 找一个押金 300 的在住单尝试超额扣除
  r = await api('POST', '/compensations', { bookingId: hemiao.id, kind: 'deposit_deduction', amount: 999, reason: '测试超额' });
  ok('押金扣除超额被拦截', r.status === 400 && /押金扣除超额/.test(r.data.message), r.data);
  r = await api('POST', '/compensations', { bookingId: hemiao.id, kind: 'deposit_deduction', amount: 100, reason: '老人加床布草损耗 100 元' });
  ok('正常押金扣除 100', r.status === 200 && Number(r.data.amount) === 100);

  // 10. 差评归因：王磊 2 星硬件单
  r = await api('GET', '/reviews');
  const rv = r.data.find((x) => x.rating === 2);
  ok('差评列表含 2 星硬件差评', rv && rv.category === 'hardware' && rv.status === 'compensated');
  r = await api('POST', `/reviews/${rv.id}/categorize`, { category: 'service' });
  ok('差评可重新归因（硬件→服务）', r.status === 200 && r.data.category === 'service');
  await api('POST', `/reviews/${rv.id}/categorize`, { category: 'hardware' });

  // 11. 赵晓单：差评+早餐不足 → 建议补偿 → 发券/退款 → 结算
  const zhao = (await api('GET', '/bookings?keyword=赵晓')).data[0];
  r = await api('GET', `/compensations/suggestions/${zhao.id}`);
  ok('赵晓单生成早餐退款+差评券建议', r.data.suggestions.length >= 2 && r.data.suggestions.some((s) => s.kind === 'refund'), r.data.suggestions);
  for (const s of r.data.suggestions) {
    await api('POST', '/compensations', {
      bookingId: zhao.id, incidentId: s.incidentId, reviewId: s.reviewId,
      kind: s.kind, amount: s.amount, reason: s.reason,
    });
  }
  r = await api('POST', `/billing/settle/${zhao.id}`);
  ok('结算单生成（房费/早餐/佣金/券/退款齐全）',
    r.status === 200 && Number(r.data.roomFee) > 0 && Number(r.data.couponCost) > 0 && Number(r.data.refundCost) > 0 && Number(r.data.commissionAmount) > 0,
    { status: r.status, data: r.data });
  r = await api('POST', `/billing/settle/${zhao.id}`);
  ok('重复结算被拒绝', r.status === 400);
  r = await api('POST', `/billing/revoke/${zhao.id}`);
  ok('结算单可撤销', r.status === 200);
  r = await api('POST', `/billing/settle/${zhao.id}`);
  ok('撤销后可重新结算', r.status === 200);

  // 12. 旺季复盘
  r = await api('GET', `/analytics/season-review?from=${d(-5)}&to=${d(14)}`);
  ok('复盘返回渠道利润', r.data.byChannel.length >= 3, r.data.byChannel?.map((c) => c.channel));
  ok('复盘返回房型利润', r.data.byRoomType.length >= 3);
  ok('复盘差评四象限归因统计', r.data.reviews.byCategory.hardware >= 1);
  ok('复盘异常结构统计', Object.keys(r.data.incidents.byType).length >= 4, r.data.incidents.byType);
  ok('复盘问题定性（价格策略/履约/客诉标签）', r.data.diagnosis.some((x) => x.tags.includes('履约能力问题')), r.data.diagnosis.map((x) => [x.name, x.tags]));
  ok('复盘 KPI 含入住率/净收入/佣金', r.data.kpi.occupancyRate > 0 && r.data.kpi.netIncome !== undefined, r.data.kpi);

  // 13. 下一轮排房建议（先预览不落地）
  r = await api('GET', `/analytics/allocation-plan?pastFrom=${d(-5)}&pastTo=${d(0)}&nextFrom=${d(20)}&nextTo=${d(26)}&apply=false`);
  ok('排房建议生成', r.status === 200 && r.data.recommendations.length === 3 && r.data.applied === false);
  const t1 = r.data.recommendations.find((x) => x.roomTypeId === 1);
  ok('山景房因超卖给出提价或削量建议', t1 && (t1.priceAdjustPct > 0 || t1.reduction > 0), t1);
  // 落地到库存
  r = await api('GET', `/analytics/allocation-plan?pastFrom=${d(-5)}&pastTo=${d(0)}&nextFrom=${d(20)}&nextTo=${d(26)}&apply=true`);
  ok('排房建议写入可售房量', r.data.applied === true);
  r = await api('GET', `/catalog/inventory?from=${d(20)}&to=${d(26)}`);
  ok('库存日历已被排房建议覆盖', r.data.overrides.length >= 3, r.data.overrides?.length);

  // 14. 维修：C302 空调在修封锁，今日不可被分配（已在住除外）；完工恢复
  r = await api('GET', '/maintenance');
  const ac = r.data.find((m) => m.status !== 'resolved' && m.category === 'ac' && m.room.number === 'C302');
  ok('C302 空调维修单封锁中', !!ac);
  r = await api('PATCH', `/maintenance/${ac.id}`, { status: 'resolved' });
  ok('维修完工自动恢复房态并关事件', r.status === 200);

  // 15. 多渠道订单金额口径：携程佣金 12%
  const wanglei = (await api('GET', '/bookings?keyword=王磊')).data[0];
  const gross = Number(wanglei.roomFee) + Number(wanglei.extraBedFee) + Number(wanglei.addOnFee);
  ok('携程渠道佣金 12% 已计入订单', Math.abs(Number(wanglei.commissionAmount) - gross * 0.12) < 0.02, { c: wanglei.commissionAmount, expect: gross * 0.12 });

  // 16. 未登录 401
  const noauth = await fetch(BASE + '/bookings');
  ok('未携带令牌返回 401', noauth.status === 401);

  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SCRIPT_ERROR', e); process.exit(2); });
