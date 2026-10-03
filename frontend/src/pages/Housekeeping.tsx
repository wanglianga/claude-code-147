import { useEffect, useState } from 'react';
import { Button, Card, Col, DatePicker, InputNumber, Modal, Popconfirm, Row, Space, Table, Tag, message } from 'antd';
import { SkinOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api';
import { BLOCK_REASON, CLEAN_STATUS } from '../labels';

export default function Housekeeping() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [tasks, setTasks] = useState<any[]>([]);
  const [linen, setLinen] = useState<any>(null);
  const [washOpen, setWashOpen] = useState(false);
  const [packs, setPacks] = useState(1);

  const load = async () => {
    setTasks(await api.get(`/housekeeping/tasks?date=${date}`));
    setLinen(await api.get('/housekeeping/linen'));
  };
  useEffect(() => { load(); }, [date]);

  const patch = async (id: number, body: any, ok = '已更新') => {
    await api.patch(`/housekeeping/tasks/${id}`, body);
    message.success(ok); load();
  };

  return (
    <div>
      <Row gutter={12}>
        <Col span={17}>
          <Card size="small" title={<Space>保洁排班（按离店时间）
            <DatePicker size="small" value={dayjs(date)} onChange={(v) => v && setDate(v.format('YYYY-MM-DD'))} allowClear={false} />
          </Space>} extra={<Button size="small" onClick={load}>刷新</Button>}>
            <Table size="small" rowKey="id" dataSource={tasks} pagination={false}
              columns={[
                { title: '订单/客人', render: (_: any, t: any) => <span>{t.booking.code.slice(-6)}<div className="muted">{t.booking.guestName}</div></span> },
                { title: '房间', render: (_: any, t: any) => t.room?.number || '-' },
                { title: '脏污', dataIndex: 'dirtLevel', width: 90,
                  render: (v: string, r: any) => <Select2 value={v}
                    options={[['light', '轻度'], ['normal', '一般'], ['heavy', '重度']]}
                    onChange={(x) => patch(r.id, { dirtLevel: x })} /> },
                { title: '时段', dataIndex: 'slot', width: 90,
                  render: (v: string, r: any) => <Select2 value={v}
                    options={[['morning', '上午'], ['mid', '中午'], ['evening', '傍晚']]}
                    onChange={(x) => patch(r.id, { slot: x })} /> },
                { title: '负责人', dataIndex: 'assignee', width: 90, render: (v: string, r: any) => v || <Button size="small" type="link" onClick={() => patch(r.id, { assignee: '管家阿敏' })}>分派阿敏</Button> },
                { title: '状态', width: 150, render: (_: any, t: any) => (
                  <Space direction="vertical" size={0}>
                    <Tag color={CLEAN_STATUS[t.status]?.color}>{CLEAN_STATUS[t.status]?.label}</Tag>
                    {t.blockedReason && <Tag color="red">{BLOCK_REASON[t.blockedReason] || t.blockedReason}</Tag>}
                  </Space>
                ) },
                { title: '布草', render: (_: any, t: any) => t.linenRequests?.map((r: any) => (
                  <Tag key={r.id} color={r.status === 'requested' ? 'gold' : r.status === 'delivered' ? 'blue' : 'green'}>
                    {r.packsNeeded}套·{({ requested: '待送', delivered: '已送', returned: '已回收' })[r.status]}
                    {r.status === 'requested' && (
                      <a style={{ marginLeft: 4 }} onClick={() => api.post(`/housekeeping/linen/deliver/${r.id}`).then(() => { message.success('布草送达，库存扣减'); load(); })}>送达</a>
                    )}
                  </Tag>
                )) },
                { title: '操作', width: 180, render: (_: any, t: any) => (
                  <Space size={2}>
                    {t.status === 'pending' && <Button size="small" onClick={() => patch(t.id, { status: 'in_progress' })}>开始</Button>}
                    {t.status === 'blocked' && <Button size="small" onClick={() => patch(t.id, { status: 'in_progress', force: true })}>强制开始</Button>}
                    {t.status === 'in_progress' && <Button size="small" type="primary" ghost onClick={() => patch(t.id, { status: 'done', dirtLevel: t.dirtLevel }, '打扫完成，已用布草转入洗涤')}>完成</Button>}
                  </Space>
                ) },
              ]} />
          </Card>
        </Col>
        <Col span={7}>
          <Card size="small" title={<><SkinOutlined /> 布草库存</>}
            extra={<Button size="small" onClick={() => { setWashOpen(true); setPacks(1); }}>洗涤回库</Button>}>
            <Row>
              <Col span={8} style={{ textAlign: 'center' }}><div style={{ fontSize: 26, color: '#2f7a4d' }}>{linen?.packsAvailable ?? 0}</div><div className="muted">干净可用（套）</div></Col>
              <Col span={8} style={{ textAlign: 'center' }}><div style={{ fontSize: 26, color: '#d48806' }}>{linen?.packsInWash ?? 0}</div><div className="muted">洗涤中（套）</div></Col>
              <Col span={8} style={{ textAlign: 'center' }}><div style={{ fontSize: 26 }}>{linen?.packsTotal ?? 0}</div><div className="muted">合计（套）</div></Col>
            </Row>
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
              · 每单离店自动生成 1 套布草申领；<br />
              · 「送达」扣减干净库存，若保洁因布草阻塞会自动解除；<br />
              · 「完成打扫」布草转洗涤中，回库后恢复干净库存。
            </div>
          </Card>
          <Card size="small" style={{ marginTop: 12 }} title="阻塞原因联动">
            <Space direction="vertical" size={4}>
              <Tag color="red">{BLOCK_REASON.delayed_checkout}</Tag>
              <span className="muted">由「延迟退房」事件自动阻塞，事件闭环后恢复</span>
              <Tag color="red">{BLOCK_REASON.linen_shortage}</Tag>
              <span className="muted">由「布草未送达」事件自动阻塞，送达布草后恢复</span>
              <Tag color="red">{BLOCK_REASON.maintenance}</Tag>
              <span className="muted">房间维修期间房态封锁，保洁顺延</span>
            </Space>
          </Card>
        </Col>
      </Row>

      <Modal title="洗涤完成回库" open={washOpen} onCancel={() => setWashOpen(false)}
        onOk={async () => {
          await api.post('/housekeeping/linen/wash-complete', { packs });
          message.success(`${packs} 套布草回库`); setWashOpen(false); load();
        }}>
        回库套数：<InputNumber min={1} max={linen?.packsInWash || 1} value={packs} onChange={(v) => setPacks(v || 1)} />
        <div className="muted">当前洗涤中 {linen?.packsInWash} 套</div>
      </Modal>
    </div>
  );
}

function Select2({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '1px 4px', fontSize: 12 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
