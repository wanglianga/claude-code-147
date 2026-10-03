import { useEffect, useState } from 'react';
import { Card, DatePicker, Space, Table, Tag, Collapse, Statistic, Row, Col, Alert } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { api } from '../api';
import { BREAKFAST_STATUS } from '../labels';

export default function Kitchen() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs().add(3, 'day')]);
  const [days, setDays] = useState<any[]>([]);

  const load = async () => {
    const r = await api.get(`/kitchen/board?from=${range[0].format('YYYY-MM-DD')}&to=${range[1].format('YYYY-MM-DD')}`);
    setDays(r.days);
  };
  useEffect(() => { load(); }, [range]);

  return (
    <Card size="small" title={<Space>早餐厨房看板（按入住人数/忌口/供应时间备餐）
      <DatePicker.RangePicker size="small" value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} allowClear={false} />
    </Space>}>
      <Collapse defaultActiveKey={days[0]?.date} items={days.map((day) => ({
        key: day.date,
        label: <Space wrap>
          <b>{day.date} 早晨</b>
          <Tag color="blue">共需 {day.totalPortions} 份</Tag>
          <Tag>已制作 {day.prepared}</Tag>
          <Tag color="green">已供应 {day.served}</Tag>
          {day.shortage > 0 && <Tag color="red">供应不足 {day.shortage} 份</Tag>}
        </Space>,
        children: (
          <>
            {day.dietary.length > 0 && <Alert style={{ marginBottom: 8 }} type="warning" showIcon
              message="忌口清单（备餐务必避开）" description={day.dietary.map((x: string, i: number) => <Tag key={i} color="orange">{x}</Tag>)} />}
            <Table size="small" rowKey="id" pagination={false} dataSource={day.orders}
              columns={[
                { title: '订单', render: (_: any, o: any) => `${o.booking.code.slice(-6)} ${o.booking.guestName}` },
                { title: '房间', render: (_: any, o: any) => o.booking.room?.number || '待分房' },
                { title: '份数', dataIndex: 'portions', width: 80 },
                { title: '忌口', dataIndex: 'dietaryRestrictions', render: (v: string) => v ? <Tag color="orange">{v}</Tag> : '-' },
                { title: '状态', width: 100, render: (_: any, o: any) => <Tag color={BREAKFAST_STATUS[o.status]?.color}>{BREAKFAST_STATUS[o.status]?.label}</Tag> },
                { title: '备餐操作', width: 240, render: (_: any, o: any) => (
                  <Space size={4}>
                    <Button2 cur={o.status} value="prepared" label="已制作" id={o.id} onDone={load} />
                    <Button2 cur={o.status} value="served" label="已供应" id={o.id} onDone={load} />
                    <Button2 cur={o.status} value="shortage" label="供应不足" id={o.id} onDone={load} danger note />
                  </Space>
                ) },
              ]} />
          </>
        ),
      }))} />
    </Card>
  );
}

function Button2({ cur, value, label, id, onDone, danger, note }: any) {
  return <button
    onClick={async () => {
      let text: string | undefined;
      if (note) text = prompt('说明供应不足原因（自动生成异常并进入补偿链路）') || undefined;
      await api.patch(`/kitchen/orders/${id}`, { status: value, note: text });
      onDone();
    }}
    style={{
      fontSize: 12, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
      border: cur === value ? '1px solid #2f7a4d' : '1px solid #d9d9d9',
      background: cur === value ? '#2f7a4d' : '#fff', color: cur === value ? '#fff' : danger ? '#cf1322' : '#333',
    }}>{label}</button>;
}
