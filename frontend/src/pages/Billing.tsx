import { useEffect, useState } from 'react';
import { Card, DatePicker, Space, Table, Tag } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { Link } from 'react-router-dom';
import { api, fmt, n } from '../api';

export default function Billing() {
  const [rows, setRows] = useState<any[]>([]);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(10, 'day'), dayjs().add(10, 'day')]);

  useEffect(() => {
    api.get(`/billing?from=${range[0].format('YYYY-MM-DD')}&to=${range[1].format('YYYY-MM-DD')}`).then(setRows);
  }, [range]);

  const total = (k: string) => rows.reduce((s, r) => s + n((r as any)[k]), 0);

  return (
    <Card size="small" title={<Space>结算单（房费·加床·早餐·押金扣除·赔付·渠道佣金·补偿券）
      <DatePicker.RangePicker size="small" value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} allowClear={false} />
    </Space>}>
      <Space size={24} style={{ marginBottom: 12 }}>
        <b>结算单数：{rows.length}</b>
        <span>营收合计：<span className="money">{fmt(total('roomFee') + total('extraBedFee') + total('breakfastFee') + total('addOnFee'))}</span></span>
        <span>佣金支出：<span style={{ color: '#999' }}>{fmt(total('commissionAmount'))}</span></span>
        <span>退款：{fmt(total('refundCost'))}</span>
        <span>补偿券：{fmt(total('couponCost'))}</span>
        <span>现金/升级赔付：{fmt(total('cashCost'))}</span>
        <span>押金扣除：{fmt(total('depositDeduction'))}</span>
        <span>净收入合计：<span className="money">{fmt(total('netIncome'))}</span></span>
      </Space>
      <Table size="small" rowKey="id" dataSource={rows} pagination={{ pageSize: 15 }}
        columns={[
          { title: '订单', render: (_: any, r: any) => <Link to={`/bookings/${r.bookingId}`}>{r.booking.code}</Link> },
          { title: '渠道', render: (_: any, r: any) => <Tag>{r.booking.channel?.name}</Tag> },
          { title: '房型', render: (_: any, r: any) => r.booking.roomType?.name },
          { title: '客人', render: (_: any, r: any) => r.booking.guestName },
          { title: '房费', dataIndex: 'roomFee', render: fmt },
          { title: '加床', dataIndex: 'extraBedFee', render: fmt },
          { title: '早餐', dataIndex: 'breakfastFee', render: fmt },
          { title: '加人/宠', dataIndex: 'addOnFee', render: fmt },
          { title: '佣金', dataIndex: 'commissionAmount', render: (v: any) => <span style={{ color: '#999' }}>-{fmt(v).slice(1)}</span> },
          { title: '押扣', dataIndex: 'depositDeduction', render: (v: any) => n(v) ? <Tag color="volcano">-{fmt(v).slice(1)}</Tag> : '-' },
          { title: '退款', dataIndex: 'refundCost', render: (v: any) => n(v) ? <Tag color="orange">-{fmt(v).slice(1)}</Tag> : '-' },
          { title: '券', dataIndex: 'couponCost', render: (v: any) => n(v) ? <Tag color="purple">-{fmt(v).slice(1)}</Tag> : '-' },
          { title: '现金赔', dataIndex: 'cashCost', render: (v: any) => n(v) ? <Tag color="red">-{fmt(v).slice(1)}</Tag> : '-' },
          { title: '应收', dataIndex: 'totalReceivable', render: (v: any) => <b>{fmt(v)}</b> },
          { title: '净收入', dataIndex: 'netIncome', render: (v: any) => <span className="money">{fmt(v)}</span> },
        ]} />
    </Card>
  );
}
