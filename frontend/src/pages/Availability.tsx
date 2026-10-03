import { useEffect, useMemo, useState } from 'react';
import { Card, DatePicker, Select, Table, Tag, Button, Space, Modal, Form, InputNumber, message, Descriptions, Alert } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Availability() {
  const nav = useNavigate();
  const [catalog, setCatalog] = useState<any>(null);
  const [roomTypeId, setRoomTypeId] = useState<number>(1);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs(), dayjs().add(6, 'day')]);
  const [rows, setRows] = useState<any[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm] = Form.useForm();
  const [plan, setPlan] = useState<any>(null);

  const load = async () => {
    const c = catalog || await api.get('/catalog/overview');
    if (!catalog) setCatalog(c);
    const from = range[0].format('YYYY-MM-DD');
    const to = range[1].add(1, 'day').format('YYYY-MM-DD');
    setRows(await api.get(`/bookings/availability?roomTypeId=${roomTypeId}&from=${from}&to=${to}`));
  };
  useEffect(() => { load(); }, [roomTypeId, range]);

  const columns = useMemo(() => [
    { title: '日期', dataIndex: 'date', width: 110, fixed: 'left' as const,
      render: (v: string) => <span>{v} <span className="muted">{['日', '一', '二', '三', '四', '五', '六'][dayjs(v).day()]}</span></span> },
    { title: '物理房', dataIndex: 'physical', width: 80 },
    { title: '可售', dataIndex: 'sellable', width: 80, render: (v: number, r: any) => v < r.physical ? <Tag color="orange">{v}</Tag> : v },
    { title: '维修封锁', dataIndex: 'inMaintenance', width: 90, render: (v: number) => v ? <Tag color="red">{v}</Tag> : 0 },
    { title: '已订', dataIndex: 'booked', width: 80 },
    { title: '剩余', dataIndex: 'remaining', width: 90,
      render: (v: number) => v <= 0 ? <Tag color="red">{v}</Tag> : <Tag color="green">{v}</Tag> },
    { title: '在住/到店订单', render: (_: any, r: any) => (
      <Space wrap>
        {r.bookings.map((b: any) => (
          <Tag key={b.id} color={b.forceOversold ? 'red' : b.status === 'checked_in' ? 'green' : 'blue'}
            style={{ cursor: 'pointer' }} onClick={() => nav(`/bookings/${b.id}`)}>
            {b.code.slice(-4)} {b.guestName}{b.roomId ? '' : '（待分房）'}{b.forceOversold ? ' 超卖' : ''}
          </Tag>
        ))}
      </Space>
    ) },
    { title: '排房备注', dataIndex: 'inventoryNote', width: 180 },
  ], []);

  const fetchPlan = async () => {
    const v = planForm.getFieldsValue();
    const f = (k: string) => v[k].format('YYYY-MM-DD');
    const r = await api.get(`/analytics/allocation-plan?pastFrom=${f('pastFrom')}&pastTo=${f('pastTo')}&nextFrom=${f('nextFrom')}&nextTo=${f('nextTo')}&apply=false`);
    setPlan(r);
  };

  const applyPlan = async () => {
    const v = planForm.getFieldsValue();
    const f = (k: string) => v[k].format('YYYY-MM-DD');
    const r = await api.get(`/analytics/allocation-plan?pastFrom=${f('pastFrom')}&pastTo=${f('pastTo')}&nextFrom=${f('nextFrom')}&nextTo=${f('nextTo')}&apply=true`);
    message.success(`已按复盘结果写入 ${r.nextPeriod.dates.length} 天的可售房量`);
    setPlan(r);
    load();
  };

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}
        title="统一房态日历（官网/小程序/OTA/电话共用同一库存池）"
        extra={<Space>
          <Select style={{ width: 160 }} value={roomTypeId} onChange={setRoomTypeId}
            options={(catalog?.roomTypes || []).map((t: any) => ({ value: t.id, label: t.name }))} />
          <DatePicker.RangePicker value={range} onChange={(v) => v && setRange(v as [Dayjs, Dayjs])} allowClear={false} />
          <Button type="primary" ghost onClick={() => { setPlanOpen(true); setPlan(null); }}>下轮排房建议</Button>
        </Space>}>
        <Table rowKey="date" size="small" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 900 }} />
      </Card>

      <Modal title="下一轮节假日排房（依据上轮超卖/布草/早餐/补偿复盘）" open={planOpen} width={860}
        onCancel={() => setPlanOpen(false)} footer={null}>
        <Form form={planForm} layout="inline" style={{ marginBottom: 12, rowGap: 8 }}
          initialValues={{
            pastFrom: dayjs().subtract(5, 'day'), pastTo: dayjs(),
            nextFrom: dayjs().add(20, 'day'), nextTo: dayjs().add(26, 'day'),
          }}>
          <Form.Item label="上轮旺季" name="pastFrom"><DatePicker /></Form.Item>
          <Form.Item label="至" name="pastTo"><DatePicker /></Form.Item>
          <Form.Item label="下轮节假日" name="nextFrom"><DatePicker /></Form.Item>
          <Form.Item label="至" name="nextTo"><DatePicker /></Form.Item>
          <Form.Item><Button type="primary" onClick={fetchPlan}>生成建议</Button></Form.Item>
        </Form>
        {plan && (
          <>
            <Alert style={{ marginBottom: 8 }} type="info" showIcon
              message="规则：超卖且无履约事故→提价不削量；布草/早餐反复出问题→调减可售房量留缓冲；入住率≥90%提价、<60%降价引流" />
            {plan.recommendations.map((r: any) => (
              <Card key={r.roomTypeId} size="small" style={{ marginBottom: 8 }} title={r.name}
                extra={<Space>
                  <Tag>物理 {r.physicalRooms} 间</Tag>
                  <Tag color={r.recommendedSellable < r.physicalRooms ? 'orange' : 'green'}>建议可售 {r.recommendedSellable}</Tag>
                  <Tag color={r.priceAdjustPct > 0 ? 'red' : r.priceAdjustPct < 0 ? 'blue' : 'default'}>
                    价格 {r.priceAdjustPct > 0 ? '+' : ''}{r.priceAdjustPct}%
                  </Tag>
                </Space>}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="上轮入住率">{r.occupancy}%</Descriptions.Item>
                  <Descriptions.Item label="依据">{r.reasons.join('；')}</Descriptions.Item>
                  <Descriptions.Item label="问题定性">{r.tags.map((t: string) => <Tag key={t}>{t}</Tag>)}</Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
            <Button type="primary" block onClick={applyPlan} disabled={plan.applied}>
              {plan.applied ? '已写入库存日历' : '采纳建议，写入下轮可售房量'}
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
