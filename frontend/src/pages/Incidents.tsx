import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, InputNumber, Modal, Select, Space, Tag, Timeline } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { INCIDENT_COLOR, INCIDENT_LABEL } from '../labels';

export default function Incidents() {
  const [rows, setRows] = useState<any[]>([]);
  const [type, setType] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ type: 'late_checkout', title: '', description: '', bookingId: undefined, meta: {} });

  const load = async () => {
    const q = new URLSearchParams();
    if (type) q.set('type', type);
    if (status) q.set('status', status);
    setRows(await api.get(`/incidents?${q}`));
  };
  useEffect(() => { load(); api.get('/bookings').then(setBookings); }, [type, status]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.type] = (m[r.type] || 0) + 1;
    return m;
  }, [rows]);

  return (
    <Card size="small" title={<Space>异常事件中心（订单·房态·保洁·维修·布草·餐食·押金·补偿同一链路）
      <Select size="small" allowClear placeholder="类型" style={{ width: 150 }} value={type} onChange={setType}
        options={Object.entries(INCIDENT_LABEL).map(([v, l]) => ({ value: v, label: `${l} ${counts[v] ? `(${counts[v]})` : ''}` }))} />
      <Select size="small" allowClear placeholder="状态" style={{ width: 120 }} value={status} onChange={setStatus}
        options={[['open', '待处理'], ['processing', '处理中'], ['compensated', '已补偿'], ['closed', '已闭环']].map(([v, l]) => ({ value: v, label: l }))} />
    </Space>} extra={<Button type="primary" size="small" onClick={() => setOpen(true)}>登记异常</Button>}>
      <Timeline items={rows.map((i) => ({
        color: i.status === 'open' ? 'red' : i.status === 'processing' ? 'blue' : i.status === 'compensated' ? 'purple' : 'green',
        children: (
          <div style={{ paddingBottom: 6 }}>
            <Space wrap>
              <Tag color={INCIDENT_COLOR[i.type]}>{INCIDENT_LABEL[i.type]}</Tag>
              <b>{i.title}</b>
              <Tag>{({ low: '低', mid: '中', high: '高' })[i.severity]}</Tag>
              <Tag color={i.status === 'open' ? 'red' : i.status === 'processing' ? 'blue' : i.status === 'compensated' ? 'purple' : 'green'}>
                {({ open: '待处理', processing: '处理中', compensated: '已补偿', closed: '已闭环' })[i.status]}
              </Tag>
              {i.bookingId && <Link to={`/bookings/${i.bookingId}`}>订单 #{i.bookingId}</Link>}
              <span className="muted">{new Date(i.occurredAt).toLocaleString('zh-CN')}</span>
            </Space>
            {i.description && <div className="muted">{i.description}</div>}
            {i.status !== 'closed' && i.status !== 'compensated' && (
              <Space style={{ marginTop: 4 }}>
                {i.status === 'open' && <Button size="small" onClick={() => api.post(`/incidents/${i.id}/process`).then(load)}>处理中</Button>}
                <Button size="small" type="primary" ghost onClick={() => {
                  const note = prompt('解决记录（可选）') || undefined;
                  api.post(`/incidents/${i.id}/resolve`, { note }).then(load);
                }}>解决闭环</Button>
              </Space>
            )}
          </div>
        ),
      }))} />

      <Modal title="登记旺季异常" open={open} onCancel={() => setOpen(false)} width={560}
        onOk={async () => {
          await api.post('/incidents', form);
          setOpen(false); setForm({ ...form, title: '', description: '' }); load();
        }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select style={{ width: '100%' }} value={form.type} onChange={(v) => setForm({ ...form, type: v })}
            options={Object.entries(INCIDENT_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          <Select style={{ width: '100%' }} allowClear showSearch placeholder="关联订单（必选才能并入住宿链路）"
            value={form.bookingId} onChange={(v) => setForm({ ...form, bookingId: v })}
            options={bookings.map((b: any) => ({ value: b.id, label: `${b.code} ${b.guestName}（${b.roomType.name}）` }))} />
          <Input placeholder="标题，如：客人 14:30 仍未退房" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input.TextArea rows={3} placeholder="描述与影响（下一间客人等待/房态封锁…）" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {form.type === 'pet_damage' && (
            <InputNumber addonBefore="维修/赔偿金额" value={form.meta?.repairCost}
              onChange={(v) => setForm({ ...form, meta: { ...form.meta, repairCost: v } })} />
          )}
          {form.type === 'extra_guest' && (
            <InputNumber addonBefore="增加人数" min={1} value={form.meta?.count || 1}
              onChange={(v) => setForm({ ...form, meta: { ...form.meta, count: v } })} />
          )}
        </Space>
      </Modal>
    </Card>
  );
}
