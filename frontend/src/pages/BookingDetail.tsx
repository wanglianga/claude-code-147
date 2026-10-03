import { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Col, Descriptions, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Timeline, message,
} from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { api, fmt, n } from '../api';
import {
  BREAKFAST_STATUS, BLOCK_REASON, CLEAN_STATUS, COMP_KIND, INCIDENT_COLOR,
  INCIDENT_LABEL, MAINT_CATEGORY, REVIEW_CATEGORY, REVIEW_CATEGORY_COLOR, BOOKING_STATUS,
} from '../labels';

export default function BookingDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [incForm, setIncForm] = useState<any>({ type: 'late_checkout', severity: 'mid', meta: {} });
  const [reviewForm, setReviewForm] = useState<any>({ rating: 3, category: 'service', content: '' });

  const load = useCallback(async () => {
    setData(await api.get(`/bookings/${id}`));
  }, [id]);
  useEffect(() => { load(); api.get('/catalog/overview').then(setCatalog); }, [load]);
  if (!data || !catalog) return null;
  const b = data.booking;

  const act = async (path: string, label: string, body?: any) => {
    await api.post(`/bookings/${id}/${path}`, body);
    message.success(`${label}成功`);
    load();
  };
  const patch = async (path: string, body: any) => api.patch(path, body).then(load);
  const incAct = async (iid: number, action: string) => {
    await api.post(`/incidents/${iid}/${action}`);
    message.success(action === 'resolve' ? '事件已闭环' : '事件标记处理中');
    load();
  };

  const issueComp = async (s: any) => {
    await api.post('/compensations', {
      bookingId: b.id, incidentId: s.incidentId, reviewId: s.reviewId,
      kind: s.kind, amount: s.amount, reason: s.reason,
    });
    message.success(`已发放：${s.reason}`);
    load();
  };

  const roomsOfType = catalog.rooms.filter((r: any) => r.roomType.id === b.roomType.id);

  const feeItems: [string, any][] = [
    ['房费（含日历浮动）', b.roomFee],
    ['加床费', b.extraBedFee],
    ['早餐费', b.breakfastFee],
    ['加人/宠物费', b.addOnFee],
    [`渠道佣金（${(n(b.commissionRate) * 100).toFixed(1)}%）`, b.commissionAmount],
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}
        title={<Space wrap>
          <span>订单 {b.code}</span>
          <Tag color={BOOKING_STATUS[b.status]?.color}>{BOOKING_STATUS[b.status]?.label}</Tag>
          <Tag>{b.channel.name}</Tag>
          {b.forceOversold && <Tag color="red">渠道超卖待安置</Tag>}
          {data.billing && <Tag color="purple">已结算</Tag>}
        </Space>}
        extra={<Space>
          {b.status === 'reserved' && <Button type="primary" onClick={() => act('check-in', '入住')} disabled={!b.room}>办理入住</Button>}
          {b.status === 'checked_in' && <Button type="primary" onClick={() => act('check-out', '离店')}>办理离店</Button>}
          {(b.status === 'reserved' || b.status === 'checked_in') && <Button danger ghost onClick={() => act('cancel', '取消订单')}>取消订单</Button>}
          <Button onClick={() => setIncidentOpen(true)} danger ghost>登记异常</Button>
          <Button onClick={() => setReviewOpen(true)}>录入差评</Button>
        </Space>}>
        <Row gutter={16}>
          <Col span={16}>
            <Descriptions size="small" column={3} bordered>
              <Descriptions.Item label="客人">{b.guestName} {b.guestPhone}</Descriptions.Item>
              <Descriptions.Item label="房型">{b.roomType.name}</Descriptions.Item>
              <Descriptions.Item label="房间">
                <Select size="small" style={{ width: 130 }} value={b.room?.id} placeholder="分房"
                  onChange={(roomId) => act('assign-room', '分房', { roomId })}
                  options={roomsOfType.map((r: any) => ({ value: r.id, label: r.number }))} />
              </Descriptions.Item>
              <Descriptions.Item label="住期">{b.arrivalDate} → {b.departureDate}（{b.nights}晚）</Descriptions.Item>
              <Descriptions.Item label="人数">
                成{b.adults} 童{b.children}
                {b.extraGuests > 0 && <Tag color="blue">临时+{b.extraGuests}人</Tag>}
                <AdjustGuests booking={b} onSaved={load} />
              </Descriptions.Item>
              <Descriptions.Item label="宠物/加床">{b.pets ? `${b.pets} 只` : '无'} / {b.extraBeds} 床</Descriptions.Item>
              <Descriptions.Item label="早餐" span={2}>
                <Space>
                  {b.breakfastPortions} 份/晚
                  {b.dietaryRestrictions && <Tag color="orange">忌口：{b.dietaryRestrictions}</Tag>}
                  <AdjustBreakfast booking={b} onSaved={load} />
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="押金">{fmt(b.depositAmount)}</Descriptions.Item>
              <Descriptions.Item label="发票" span={3}>{b.invoiceRequired ? `需要，抬头：${b.invoiceTitle || '（待补）'}` : '不需要'}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={8}>
            <Card size="small" title="费用口径" styles={{ body: { padding: 8 } }}>
              {feeItems.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span className="muted">{k}</span><span className="money">{fmt(v)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #ccc', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>应收合计</span><span className="money">{fmt(n(b.roomFee) + n(b.extraBedFee) + n(b.breakfastFee) + n(b.addOnFee))}</span>
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={12} className="chain-section">
        <Col span={12}>
          <Card size="small" style={{ marginBottom: 12 }} title={`🧹 保洁与布草（${data.cleaningTasks.length}）`}>
            <Table size="small" pagination={false} rowKey="id" dataSource={data.cleaningTasks}
              columns={[
                { title: '计划日/时段', render: (_: any, t: any) => `${t.scheduledDate} ${t.slot}` },
                { title: '脏污', dataIndex: 'dirtLevel', width: 70, render: (v: string) => ({ light: '轻度', normal: '一般', heavy: '重度' }[v]) },
                { title: '负责人', dataIndex: 'assignee', width: 80, render: (v: string, t: any) => v || <Button size="small" type="link" onClick={() => patch(`/housekeeping/tasks/${t.id}`, { assignee: '管家阿敏' })}>分派</Button> },
                { title: '状态', width: 150, render: (_: any, t: any) => (
                  <Space direction="vertical" size={0}>
                    <Tag color={CLEAN_STATUS[t.status]?.color}>{CLEAN_STATUS[t.status]?.label}</Tag>
                    {t.blockedReason && <Tag color="red">{BLOCK_REASON[t.blockedReason] || t.blockedReason}</Tag>}
                  </Space>
                ) },
                { title: '操作', render: (_: any, t: any) => (
                  <Space size={2}>
                    {t.status === 'blocked' && <Button size="small" onClick={() => patch(`/housekeeping/tasks/${t.id}`, { status: 'in_progress', force: true })}>强制开始</Button>}
                    {t.status === 'pending' && <Button size="small" onClick={() => patch(`/housekeeping/tasks/${t.id}`, { status: 'in_progress' })}>开始</Button>}
                    {t.status === 'in_progress' && <Button size="small" type="primary" ghost onClick={() => patch(`/housekeeping/tasks/${t.id}`, { status: 'done' })}>完成</Button>}
                  </Space>
                ) },
              ]} />
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ marginBottom: 4 }}>布草申领：</div>
              <Table size="small" pagination={false} rowKey="id" dataSource={data.linenRequests}
                columns={[
                  { title: '需求', render: (_: any, r: any) => `${r.packsNeeded} 套` },
                  { title: '状态', render: (_: any, r: any) => <Tag color={r.status === 'delivered' ? 'blue' : r.status === 'returned' ? 'green' : 'gold'}>{({ requested: '待送达', delivered: '已送达', returned: '已回收洗涤' })[r.status]}</Tag> },
                  { title: '操作', render: (_: any, r: any) => r.status === 'requested'
                    ? <Button size="small" type="primary" ghost onClick={() => api.post(`/housekeeping/linen/deliver/${r.id}`).then(() => { message.success('布草已送达，保洁阻塞自动解除'); load(); })}>送达布草</Button>
                    : '-' },
                ]} />
            </div>
          </Card>

          <Card size="small" style={{ marginBottom: 12 }} title={`🍳 早餐计划（${data.breakfastOrders.length} 餐）`}>
            <Table size="small" pagination={false} rowKey="id" dataSource={data.breakfastOrders}
              columns={[
                { title: '供应日', dataIndex: 'date' },
                { title: '份数', dataIndex: 'portions', width: 70 },
                { title: '忌口', dataIndex: 'dietaryRestrictions', render: (v: string) => v ? <Tag color="orange">{v}</Tag> : '-' },
                { title: '状态', width: 100, render: (_: any, o: any) => <Tag color={BREAKFAST_STATUS[o.status]?.color}>{BREAKFAST_STATUS[o.status]?.label}</Tag> },
                { title: '厨房操作', width: 200, render: (_: any, o: any) => (
                  <Select size="small" style={{ width: 120 }} value={o.status}
                    onChange={(status) => patch(`/kitchen/orders/${o.id}`, { status })}
                    options={Object.entries(BREAKFAST_STATUS).map(([v, l]) => ({ value: v, label: l.label }))} />
                ) },
              ]} />
          </Card>

          <Card size="small" title={`🔧 维修单（${data.tickets.length}）`}>
            {data.tickets.length === 0 && <span className="muted">无</span>}
            {data.tickets.map((t: any) => (
              <div key={t.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>
                <Space wrap>
                  <Tag>{MAINT_CATEGORY[t.category]}</Tag>
                  <b>{t.title}</b>
                  <Tag color={t.status === 'resolved' ? 'green' : 'red'}>{({ open: '待修', repairing: '维修中', resolved: '已修复' })[t.status]}</Tag>
                  {t.blocksRoom && <Tag color="orange">封锁房态 {t.blockDateFrom || ''}~{t.blockDateTo || ''}</Tag>}
                  {t.repairCost > 0 && <span className="money">维修费 {fmt(t.repairCost)}</span>}
                  {t.status !== 'resolved' && <Button size="small" onClick={() => patch(`/maintenance/${t.id}`, { status: 'resolved' })}>完工恢复房态</Button>}
                </Space>
                {t.description && <div className="muted">{t.description}</div>}
              </div>
            ))}
          </Card>
        </Col>

        <Col span={12}>
          <Card size="small" style={{ marginBottom: 12 }} title={`⚠️ 异常事件链（${data.incidents.length}）`}>
            <Timeline items={data.incidents.map((i: any) => ({
              color: i.status === 'open' ? 'red' : i.status === 'processing' ? 'blue' : 'green',
              children: (
                <div>
                  <Space wrap>
                    <Tag color={INCIDENT_COLOR[i.type]}>{INCIDENT_LABEL[i.type]}</Tag>
                    <b>{i.title}</b>
                    <Tag>{({ low: '低', mid: '中', high: '高' })[i.severity]}</Tag>
                    <Tag color={i.status === 'open' ? 'red' : i.status === 'processing' ? 'blue' : i.status === 'compensated' ? 'purple' : 'green'}>
                      {({ open: '待处理', processing: '处理中', compensated: '已补偿', closed: '已闭环' })[i.status]}
                    </Tag>
                  </Space>
                  {i.description && <div className="muted" style={{ marginTop: 4 }}>{i.description}</div>}
                  {i.meta && <div className="timeline-meta">{JSON.stringify(i.meta)}</div>}
                  {i.status !== 'closed' && i.status !== 'compensated' && (
                    <Space style={{ marginTop: 4 }}>
                      {i.status === 'open' && <Button size="small" onClick={() => incAct(i.id, 'process')}>处理中</Button>}
                      <Button size="small" type="primary" ghost onClick={() => incAct(i.id, 'resolve')}>解决闭环</Button>
                    </Space>
                  )}
                </div>
              ),
            }))} />
          </Card>

          <Card size="small" style={{ marginBottom: 12 }} title={`⭐ 差评（${data.reviews.length}）`}>
            {data.reviews.length === 0 && <span className="muted">无</span>}
            {data.reviews.map((r: any) => (
              <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>
                <Space wrap>
                  <span>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  <Select size="small" style={{ width: 120 }} value={r.category}
                    onChange={(category) => api.post(`/reviews/${r.id}/categorize`, { category }).then(load)}
                    options={Object.entries(REVIEW_CATEGORY).map(([v, l]) => ({ value: v, label: l }))} />
                  <Tag color={REVIEW_CATEGORY_COLOR[r.category]}>{REVIEW_CATEGORY[r.category]}</Tag>
                  <Tag>{({ posted: '待回复', replied: '已回复', compensated: '已补偿' })[r.status]}</Tag>
                </Space>
                <div style={{ marginTop: 4 }}>{r.content}</div>
                {!r.replyNote && <Input.Search size="small" style={{ marginTop: 4 }} placeholder="回复差评…" enterButton="回复"
                  onSearch={(replyNote) => api.post(`/reviews/${r.id}/reply`, { replyNote }).then(load)} />}
                {r.replyNote && <div className="muted">回复：{r.replyNote}</div>}
              </div>
            ))}
          </Card>

          <Card size="small" style={{ marginBottom: 12 }} title={`🎟️ 补偿 / 押金记录（${data.compensations.length}）`}
            extra={<Suggestions bookingId={b.id} deposit={b.depositAmount} onIssue={issueComp} />}>
            <Table size="small" pagination={false} rowKey="id" dataSource={data.compensations}
              columns={[
                { title: '类型', dataIndex: 'kind', width: 90, render: (v: string) => <Tag color={COMP_KIND[v]?.color}>{COMP_KIND[v]?.label}</Tag> },
                { title: '金额', dataIndex: 'amount', width: 90, render: (v: any) => <span className="money">{fmt(v)}</span> },
                { title: '券号', dataIndex: 'couponCode', width: 100 },
                { title: '原因', dataIndex: 'reason' },
                { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag>{({ issued: '生效', used: '已使用', revoked: '已撤销' })[v]}</Tag> },
              ]} />
          </Card>

          <Card size="small" title="💰 结算">
            {data.billing ? (
              <>
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="房费">{fmt(data.billing.roomFee)}</Descriptions.Item>
                  <Descriptions.Item label="加床">{fmt(data.billing.extraBedFee)}</Descriptions.Item>
                  <Descriptions.Item label="早餐">{fmt(data.billing.breakfastFee)}</Descriptions.Item>
                  <Descriptions.Item label="加人/宠物">{fmt(data.billing.addOnFee)}</Descriptions.Item>
                  <Descriptions.Item label="渠道佣金" labelStyle={{ color: '#999' }}>-{fmt(data.billing.commissionAmount)}</Descriptions.Item>
                  <Descriptions.Item label="押金收取">{fmt(data.billing.depositCollected)}</Descriptions.Item>
                  <Descriptions.Item label="押金扣除">-{fmt(data.billing.depositDeduction)}</Descriptions.Item>
                  <Descriptions.Item label="退款">-{fmt(data.billing.refundCost)}</Descriptions.Item>
                  <Descriptions.Item label="补偿券成本">-{fmt(data.billing.couponCost)}</Descriptions.Item>
                  <Descriptions.Item label="现金/升级赔付">-{fmt(data.billing.cashCost)}</Descriptions.Item>
                  <Descriptions.Item label="客人应收合计" span={2}><b>{fmt(data.billing.totalReceivable)}</b></Descriptions.Item>
                  <Descriptions.Item label="订单净收入（计入复盘利润）" span={2}><b style={{ color: '#c0392b' }}>{fmt(data.billing.netIncome)}</b></Descriptions.Item>
                </Descriptions>
                <Button size="small" danger ghost style={{ marginTop: 8 }} onClick={async () => { await api.post(`/billing/revoke/${b.id}`); message.success('结算单已撤销，可调整后重新结算'); load(); }}>撤销结算</Button>
              </>
            ) : (
              <Space>
                <Button type="primary" disabled={b.status === 'cancelled'} onClick={async () => { await api.post(`/billing/settle/${b.id}`); message.success('已生成结算单'); load(); }}>按当前补偿记录结算</Button>
                <span className="muted">佣金、押金扣除、退款、券与赔付自动归集</span>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Modal title="登记旺季异常事件" open={incidentOpen} onCancel={() => setIncidentOpen(false)}
        onOk={async () => {
          await api.post('/incidents', { ...incForm, bookingId: b.id, roomId: b.room?.id });
          message.success('异常已并入本订单住宿链路');
          setIncidentOpen(false); load();
        }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select style={{ width: '100%' }} value={incForm.type} onChange={(v) => setIncForm({ ...incForm, type: v })}
            options={Object.entries(INCIDENT_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          <Input placeholder="标题" value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} />
          <Input.TextArea rows={3} placeholder="描述（延迟多久/故障现象/损坏程度…）" value={incForm.description}
            onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} />
          {incForm.type === 'pet_damage' && (
            <InputNumber addonBefore="建议赔偿金额" value={incForm.meta?.repairCost}
              onChange={(v) => setIncForm({ ...incForm, meta: { ...incForm.meta, repairCost: v } })} />
          )}
          {incForm.type === 'extra_guest' && (
            <InputNumber addonBefore="增加人数" min={1} value={incForm.meta?.count || 1}
              onChange={(v) => setIncForm({ ...incForm, meta: { ...incForm.meta, count: v } })} />
          )}
        </Space>
      </Modal>

      <Modal title="录入 OTA/渠道差评" open={reviewOpen} onCancel={() => setReviewOpen(false)}
        onOk={async () => {
          await api.post('/reviews', { bookingId: b.id, ...reviewForm });
          message.success('差评已进入链路，低分自动生成事件');
          setReviewOpen(false); load();
        }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            评分
            <Select style={{ width: 90 }} value={reviewForm.rating} onChange={(v) => setReviewForm({ ...reviewForm, rating: v })}
              options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v} 星` }))} />
            归因
            <Select style={{ width: 130 }} value={reviewForm.category} onChange={(v) => setReviewForm({ ...reviewForm, category: v })}
              options={Object.entries(REVIEW_CATEGORY).map(([v, l]) => ({ value: v, label: l }))} />
          </Space>
          <Input.TextArea rows={3} placeholder="差评内容（可留空归因，系统按关键词预分类）" value={reviewForm.content}
            onChange={(e) => setReviewForm({ ...reviewForm, content: e.target.value })} />
        </Space>
      </Modal>
    </div>
  );
}

function Suggestions({ bookingId, deposit, onIssue }: { bookingId: number; deposit: any; onIssue: (s: any) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[]>([]);
  return <>
    <Button size="small" onClick={async () => {
      const r = await api.get(`/compensations/suggestions/${bookingId}`);
      setList(r.suggestions); setOpen(true);
    }}>智能补偿建议</Button>
    <Modal title="未闭环事件的补偿建议" open={open} onCancel={() => setOpen(false)} footer={null} width={620}>
      <div className="muted" style={{ marginBottom: 8 }}>本单押金 {fmt(deposit)}，系统按异常类型自动给出券/退款/押金扣除建议：</div>
      {list.length === 0 && <div>当前没有待补偿的未闭环事件 🎉</div>}
      {list.map((s, i) => (
        <Card key={i} size="small" style={{ marginBottom: 8 }}
          title={<Space><Tag color={COMP_KIND[s.kind]?.color}>{COMP_KIND[s.kind]?.label}</Tag><span className="money">{fmt(s.amount)}</span></Space>}
          extra={<Button size="small" type="primary" onClick={() => onIssue(s)}>采纳发放</Button>}>
          {s.reason}
        </Card>
      ))}
    </Modal>
  </>;
}

function AdjustGuests({ booking, onSaved }: { booking: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [adults, setAdults] = useState(booking.adults);
  const [children, setChildren] = useState(booking.children);
  return <>
    <Button size="small" type="link" onClick={() => setOpen(true)}>调整</Button>
    <Modal title="调整入住人数（临时加人触发附加费重算）" open={open} onCancel={() => setOpen(false)}
      onOk={async () => { await api.patch(`/bookings/${booking.id}`, { adults, children }); setOpen(false); onSaved(); }}>
      <Space>成人<InputNumber min={1} value={adults} onChange={setAdults} /> 儿童<InputNumber min={0} value={children} onChange={setChildren} /></Space>
      <div className="muted">客人到店后新增的人头请走「登记异常→客人临时加人」，自动计 100 元/人/晚</div>
    </Modal>
  </>;
}

function AdjustBreakfast({ booking, onSaved }: { booking: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [portions, setPortions] = useState(booking.breakfastPortions);
  return <>
    <Button size="small" type="link" onClick={() => setOpen(true)}>调整份数</Button>
    <Modal title="调整早餐份数与忌口" open={open} onCancel={() => setOpen(false)}
      onOk={async () => {
        await api.patch(`/bookings/${booking.id}`, {
          breakfastPortions: portions,
        });
        setOpen(false); onSaved();
      }}>
      <InputNumber min={0} value={portions} onChange={setPortions} addonBefore="份/晚" />
    </Modal>
  </>;
}
