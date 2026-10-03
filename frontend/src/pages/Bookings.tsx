import { useEffect, useRef, useState } from 'react';
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { BOOKING_STATUS } from '../labels';

export default function Bookings() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const rangeRef = useRef<[Dayjs, Dayjs] | null>(null);

  const load = async () => {
    const params = new URLSearchParams();
    if (rangeRef.current) {
      params.set('from', rangeRef.current[0].format('YYYY-MM-DD'));
      params.set('to', rangeRef.current[1].add(1, 'day').format('YYYY-MM-DD'));
    }
    setRows(await api.get(`/bookings?${params.toString()}`));
  };
  useEffect(() => { api.get('/catalog/overview').then(setCatalog); load(); }, []);

  const act = async (id: number, path: string, label: string) => {
    await api.post(`/bookings/${id}/${path}`);
    message.success(`${label}成功`);
    load();
  };

  const submit = async () => {
    const v = await form.validateFields();
    setCreating(true);
    try {
      await api.post('/bookings', {
        channelCode: v.channelCode,
        roomTypeId: v.roomTypeId,
        guestName: v.guestName, guestPhone: v.guestPhone,
        arrivalDate: v.range[0].format('YYYY-MM-DD'),
        departureDate: v.range[1].format('YYYY-MM-DD'),
        adults: v.adults, children: v.children, extraBeds: v.extraBeds,
        pets: v.pets, breakfastPortions: v.breakfastPortions,
        dietaryRestrictions: v.dietaryRestrictions,
        depositAmount: v.depositAmount,
        invoiceRequired: v.invoiceRequired, invoiceTitle: v.invoiceTitle,
        forceOversell: v.forceOversell,
      });
      message.success('订房已登记，保洁/布草/早餐链路已自动生成');
      setOpen(false); form.resetFields(); load();
    } catch { /* 已提示 */ } finally { setCreating(false); }
  };

  const columns = [
    { title: '订单号', dataIndex: 'code', render: (v: string) => <a>{v}</a> },
    { title: '渠道', render: (_: any, r: any) => <Tag>{r.channel.name}</Tag> },
    { title: '房型/房间', render: (_: any, r: any) => <span>{r.roomType.name}{r.room ? ` / ${r.room.number}` : <Tag color="red" style={{ marginLeft: 4 }}>待分房</Tag>}</span> },
    { title: '客人', render: (_: any, r: any) => <span>{r.guestName}<div className="muted">{r.guestPhone}</div></span> },
    { title: '住期', render: (_: any, r: any) => <span>{r.arrivalDate} → {r.departureDate}<div className="muted">{r.nights} 晚</div></span> },
    { title: '人/宠/床/早', width: 130, render: (_: any, r: any) => `${r.adults + r.children + r.extraGuests}人${r.pets ? ` ${r.pets}宠` : ''}${r.extraBeds ? ` +${r.extraBeds}床` : ''} / ${r.breakfastPortions}早` },
    { title: '押金', dataIndex: 'depositAmount', width: 80, render: (v: any) => (Number(v) ? `¥${v}` : '-') },
    { title: '发票', width: 70, render: (_: any, r: any) => r.invoiceRequired ? <Tag color="blue">要</Tag> : '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (s: string, r: any) => (
      <Space direction="vertical" size={0}>
        <Tag color={BOOKING_STATUS[s]?.color}>{BOOKING_STATUS[s]?.label}</Tag>
        {r.forceOversold && <Tag color="red">超卖</Tag>}
        {r.settled && <Tag color="purple">已结算</Tag>}
      </Space>
    ) },
    { title: '操作', width: 230, fixed: 'right' as const, render: (_: any, r: any) => (
      <Space size={4}>
        <Button size="small" onClick={() => nav(`/bookings/${r.id}`)}>链路</Button>
        {r.status === 'reserved' && <Button size="small" type="primary" ghost onClick={() => act(r.id, 'check-in', '入住')}>入住</Button>}
        {r.status === 'checked_in' && <Button size="small" type="primary" ghost onClick={() => act(r.id, 'check-out', '离店')}>离店</Button>}
        {(r.status === 'reserved' || r.status === 'checked_in') && <Button size="small" danger ghost onClick={() => act(r.id, 'cancel', '取消')}>取消</Button>}
      </Space>
    ) },
  ];

  return (
    <Card size="small"
      title={<Space><span>统一订房登记（全渠道）</span>
        <DatePicker.RangePicker size="small" onChange={(v) => { rangeRef.current = v as [Dayjs, Dayjs]; load(); }} />
      </Space>}
      extra={<Space>
        <Button icon={<ReloadOutlined />} size="small" onClick={load}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setOpen(true)}>多渠道登记订房</Button>
      </Space>}>
      <Table rowKey="id" size="small" columns={columns} dataSource={rows}
        onRow={(r) => ({ onClick: () => nav(`/bookings/${r.id}`) })}
        pagination={{ pageSize: 12 }} scroll={{ x: 1100 }} />

      <Modal title="登记订房（官网 / 小程序 / OTA / 电话）" open={open} width={760}
        onCancel={() => setOpen(false)} onOk={submit} confirmLoading={creating} okText="登记并生成住宿链路">
        <Form form={form} layout="vertical"
          initialValues={{
            channelCode: 'direct', adults: 2, children: 0, extraBeds: 0, pets: 0,
            breakfastPortions: 2, depositAmount: 300, invoiceRequired: false, forceOversell: false,
            range: [dayjs(), dayjs().add(2, 'day')],
          }}>
          <Space size={16} wrap>
            <Form.Item label="渠道" name="channelCode" rules={[{ required: true }]} style={{ width: 230 }}>
              <Select options={(catalog?.channels || []).map((c: any) => ({ value: c.code, label: `${c.name}（佣金 ${(Number(c.commissionRate) * 100).toFixed(0)}%）` }))} />
            </Form.Item>
            <Form.Item label="房型" name="roomTypeId" rules={[{ required: true }]} style={{ width: 300 }}>
              <Select options={(catalog?.roomTypes || []).map((t: any) => ({
                value: t.id,
                label: `${t.name} 基础¥${t.basePrice} 限${t.maxOccupancy}人${t.allowPets ? ' 可宠' : ' 禁宠'}`,
              }))} />
            </Form.Item>
          </Space>
          <Space size={16} wrap>
            <Form.Item label="客人姓名" name="guestName" rules={[{ required: true }]} style={{ width: 160 }}><Input /></Form.Item>
            <Form.Item label="联系电话" name="guestPhone" style={{ width: 180 }}><Input /></Form.Item>
            <Form.Item label="入住 → 离店" name="range" rules={[{ required: true }]}>
              <DatePicker.RangePicker />
            </Form.Item>
          </Space>
          <Space size={16} wrap>
            <Form.Item label="成人" name="adults"><InputNumber min={1} /></Form.Item>
            <Form.Item label="儿童" name="children"><InputNumber min={0} /></Form.Item>
            <Form.Item label="加床" name="extraBeds"><InputNumber min={0} /></Form.Item>
            <Form.Item label="宠物数" name="pets"><InputNumber min={0} /></Form.Item>
            <Form.Item label="早餐份数" name="breakfastPortions"><InputNumber min={0} /></Form.Item>
            <Form.Item label="押金(元)" name="depositAmount"><InputNumber min={0} /></Form.Item>
          </Space>
          <Form.Item label="忌口要求（厨房按此备餐）" name="dietaryRestrictions"><Input placeholder="如：孩子花生过敏 / 不吃香菜 / 乳糖不耐受" /></Form.Item>
          <Space size={24}>
            <Form.Item label="需要发票" name="invoiceRequired" valuePropName="checked" style={{ marginBottom: 0 }}><Switch checkedChildren="要" unCheckedChildren="否" /></Form.Item>
            <Form.Item label="发票抬头" name="invoiceTitle" style={{ marginBottom: 0, minWidth: 220 }}><Input placeholder="如需发票填抬头" /></Form.Item>
            <Form.Item label="强制超卖登记" name="forceOversell" valuePropName="checked" style={{ marginBottom: 0 }}
              tooltip="库存已满但确需登记（如 OTA 已收款）时勾选，系统将挂超卖事件且不分房">
              <Switch checkedChildren="超卖" unCheckedChildren="正常" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Card>
  );
}
