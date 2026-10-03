import { Booking, Compensation } from '../entities';
import { round2 } from './util';

// 单笔订单结算：房费、加床、早餐、宠物费、押金扣留、渠道佣金、补偿支出全部列清
export function computeSettlement(b: Booking, compensations: Compensation[]) {
  const commissionRate = Number(b.channel?.commissionRate || 0);
  const commission = round2(Number(b.roomFee) * commissionRate);
  const compTotal = round2(compensations.reduce((s, c) => s + Number(c.amount), 0));
  const gross = round2(
    Number(b.roomFee) + Number(b.extraBedFee) + Number(b.breakfastFee) + Number(b.petFee),
  );
  const net = round2(gross - commission - compTotal + Number(b.depositDeducted));
  return {
    bookingId: b.id,
    code: b.code,
    guestName: b.guestName,
    channel: b.channel?.name,
    channelCode: b.channel?.code,
    roomType: (b as any).roomType?.name,
    roomCode: (b as any).room?.code,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    lines: [
      { label: '房费', amount: round2(Number(b.roomFee)) },
      { label: '加床费', amount: round2(Number(b.extraBedFee)) },
      { label: '早餐费', amount: round2(Number(b.breakfastFee)) },
      { label: '宠物清洁费', amount: round2(Number(b.petFee)) },
      { label: '渠道佣金', amount: -commission },
      { label: '补偿/赔付支出', amount: -compTotal },
      { label: '押金扣款留存', amount: round2(Number(b.depositDeducted)) },
    ],
    gross,
    commission,
    commissionRate,
    compensation: compTotal,
    deposit: {
      collected: round2(Number(b.depositAmount)),
      deducted: round2(Number(b.depositDeducted)),
      returned: round2(Number(b.depositReturned)),
    },
    net,
  };
}
