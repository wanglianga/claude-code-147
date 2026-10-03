import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Select, Space, Statistic, Table, Tag, Row, Col, message } from 'antd';
import { Link } from 'react-router-dom';
import { api, fmt, n } from '../api';
import { REVIEW_CATEGORY, REVIEW_CATEGORY_COLOR } from '../labels';

export default function Reviews() {
  const [rows, setRows] = useState<any[]>([]);
  const [category, setCategory] = useState<string>();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ rating: 3, category: undefined, content: '', authorName: '', channelCode: undefined });

  const load = async () => {
    const q = category ? `?category=${category}` : '';
    setRows(await api.get(`/reviews${q}`));
  };
  useEffect(() => { load(); }, [category]);

  const stats = useMemo(() => {
    const byCat: Record<string, number> = { hardware: 0, service: 0, oversell: 0, food_prep: 0, other: 0 };
    let bad = 0, sum = 0;
    for (const r of rows) { byCat[r.category] = (byCat[r.category] || 0) + 1; if (r.rating <= 3) bad++; sum += r.rating; }
    return { byCat, bad, avg: rows.length ? sum / rows.length : 0 };
  }, [rows]);

  return (
    <div>
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={5}><Card><Statistic title="评价总数" value={rows.length} /></Card></Col>
        <Col span={5}><Card><Statistic title="差评价（≤3星）" value={stats.bad} valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col span={5}><Card><Statistic title="平均评分" value={stats.avg} precision={1} suffix="/ 5" /></Card></Col>
        <Col span={9}>
          <Card size="small">
            <Space wrap>
              {Object.entries(stats.byCat).map(([k, v]) => (
                <Tag key={k} color={REVIEW_CATEGORY_COLOR[k]} style={{ fontSize: 13, padding: '2px 10px' }}>
                  {REVIEW_CATEGORY[k]} {v}
                </Tag>
              ))}
            </Space>
            <div className="muted" style={{ marginTop: 6 }}>差评来源归因 → 硬件 / 服务 / 超卖 / 餐食，指导下轮调价与排班</div>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="差评管理"
        extra={<Space>
          <Select size="small" allowClear placeholder="按归因筛选" style={{ width: 150 }} value={category} onChange={setCategory}
            options={Object.entries(REVIEW_CATEGORY).map(([v, l]) => ({ value: v, label: l }))} />
          <Button type="primary" size="small" onClick={() => setOpen(true)}>录入渠道差评</Button>
        </Space>}>
        <Table size="small" rowKey="id" dataSource={rows} pagination={false}
          columns={[
            { title: '评分', dataIndex: 'rating', width: 110, render: (v: number) => <span style={{ color: v <= 3 ? '#cf1322' : '#389e0d' }}>{'★'.repeat(v)}{'☆'.repeat(5 - v)}</span> },
            { title: '渠道', width: 110, render: (_: any, r: any) => r.channel?.name || '-' },
            { title: '客人', dataIndex: 'authorName', width: 100 },
            { title: '内容', render: (_: any, r: any) => <span>{r.content}{r.replyNote && <div className="muted">店主回复：{r.replyNote}</div>}</span> },
            { title: '归因', width: 130, render: (_: any, r: any) => (
              <Select size="small" style={{ width: 120 }} value={r.category}
                onChange={(c) => api.post(`/reviews/${r.id}/categorize`, { category: c }).then(load)}
                options={Object.entries(REVIEW_CATEGORY).map(([v, l]) => ({ value: v, label: l }))} />
            ) },
            { title: '状态', width: 90, render: (_: any, r: any) => <Tag color={r.status === 'compensated' ? 'purple' : r.status === 'replied' ? 'blue' : 'default'}>{({ posted: '待回复', replied: '已回复', compensated: '已补偿' })[r.status]}</Tag> },
            { title: '操作', width: 150, render: (_: any, r: any) => (
              <Space size={4}>
                {!r.replyNote && <Button size="small" onClick={() => {
                  const replyNote = prompt('回复内容') || '';
                  if (replyNote) api.post(`/reviews/${r.id}/reply`, { replyNote }).then(load);
                }}>回复</Button>}
                {r.bookingId && <Link to={`/bookings/${r.bookingId}`}><Button size="small" type="link">住宿链路</Button></Link>}
              </Space>
            ) },
          ]} />
      </Card>

      <Modal title="录入渠道差评（无关联订单时选渠道）" open={open} onCancel={() => setOpen(false)} width={520}
        onOk={async () => {
          if (!form.content) { message.warning('请填写差评内容'); return; }
          await api.post('/reviews', form);
          message.success('已录入，≤3 星自动生成差评事件并入链路');
          setOpen(false); setForm({ rating: 3, category: undefined, content: '', authorName: '', channelCode: undefined }); load();
        }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Select style={{ width: 100 }} value={form.rating} onChange={(v) => setForm({ ...form, rating: v })}
              options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v}星` }))} />
            <Select style={{ width: 150 }} allowClear placeholder="归因（可自动识别）" value={form.category} onChange={(v) => setForm({ ...form, category: v })}
              options={Object.entries(REVIEW_CATEGORY).map(([v, l]) => ({ value: v, label: l }))} />
            <Select style={{ width: 150 }} allowClear placeholder="来源渠道" value={form.channelCode} onChange={(v) => setForm({ ...form, channelCode: v })}
              options={[['direct', '官网'], ['miniapp', '小程序'], ['ctrip', '携程'], ['meituan', '美团'], ['phone', '电话']].map(([v, l]) => ({ value: v, label: l }))} />
          </Space>
          <Input placeholder="客人昵称（可选）" value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} />
          <Input.TextArea rows={3} placeholder="差评内容（含 空调/早餐/超卖/态度 等关键词会自动预归因）" value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </Space>
      </Modal>
    </div>
  );
}
