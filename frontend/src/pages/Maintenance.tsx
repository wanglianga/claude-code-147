import { useEffect, useState } from 'react';
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api';
import { MAINT_CATEGORY } from '../labels';

export default function Maintenance() {
  const [rows, setRows] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => setRows(await api.get('/maintenance'));
  useEffect(() => { load(); api.get('/catalog/overview').then(setCatalog); }, []);

  return (
    <Card size="small" title="维修房态（硬件故障自动入异常链并封锁房态，完工自动恢复）"
      extra={<Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => setOpen(true)}>报维修</Button>}>
      <Table size="small" rowKey="id" pagination={false} dataSource={rows}
        columns={[
          { title: '房间', render: (_: any, r: any) => `${r.room.number} ${r.room.roomType?.name}` },
          { title: '类别', dataIndex: 'category', width: 90, render: (v: string) => <Tag>{MAINT_CATEGORY[v]}</Tag> },
          { title: '问题', render: (_: any, r: any) => <span><b>{r.title}</b><div className="muted">{r.description}</div></span> },
          { title: '封锁日期', width: 180, render: (_: any, r: any) => r.blocksRoom ? `${r.blockDateFrom || '即时'} ~ ${r.blockDateTo || '至修复'}` : '不封锁' },
          { title: '维修费', dataIndex: 'repairCost', width: 90, render: (v: any) => Number(v) ? <span className="money">¥{v}</span> : '-' },
          { title: '关联单', render: (_: any, r: any) => r.booking ? <Tag>{r.booking.code.slice(-6)}</Tag> : '-' },
          { title: '状态', width: 100, render: (_: any, r: any) => <Tag color={r.status === 'resolved' ? 'green' : r.status === 'repairing' ? 'blue' : 'red'}>{({ open: '待修', repairing: '维修中', resolved: '已修复' })[r.status]}</Tag> },
          { title: '操作', width: 170, render: (_: any, r: any) => r.status !== 'resolved' && (
            <Space size={4}>
              {r.status === 'open' && <Button size="small" onClick={() => api.patch(`/maintenance/${r.id}`, { status: 'repairing' }).then(load)}>开始维修</Button>}
              <Button size="small" type="primary" ghost onClick={() => api.patch(`/maintenance/${r.id}`, { status: 'resolved' }).then(() => { message.success('房态已恢复，硬件事件自动闭环'); load(); })}>完工</Button>
              <InputNumber size="small" style={{ width: 80 }} placeholder="维修费" defaultValue={Number(r.repairCost) || undefined}
                onChange={async (v) => { await api.patch(`/maintenance/${r.id}`, { repairCost: v || 0 }); }} />
            </Space>
          ) },
        ]} />

      <Modal title="登记房间硬件故障" open={open} onCancel={() => setOpen(false)}
        onOk={async () => {
          const v = await form.validateFields();
          await api.post('/maintenance', {
            roomId: v.roomId, category: v.category, title: v.title, description: v.description,
            blocksRoom: v.blocksRoom, bookingId: v.bookingId, repairCost: v.repairCost || 0,
            dateFrom: v.range?.[0]?.format('YYYY-MM-DD'), dateTo: v.range?.[1]?.format('YYYY-MM-DD'),
          });
          message.success('已报修并生成硬件故障事件');
          setOpen(false); form.resetFields(); load();
        }}>
        <Form form={form} layout="vertical" initialValues={{ category: 'ac', blocksRoom: true, repairCost: 0 }}>
          <Form.Item label="房间" name="roomId" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label"
              options={(catalog?.rooms || []).map((r: any) => ({ value: r.id, label: `${r.number} ${r.roomType.name}` }))} />
          </Form.Item>
          <Space>
            <Form.Item label="故障类别" name="category">
              <Select style={{ width: 140 }} options={Object.entries(MAINT_CATEGORY).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
            <Form.Item label="预计维修费" name="repairCost"><InputNumber min={0} addonAfter="元" /></Form.Item>
            <Form.Item label="封锁该房售卖" name="blocksRoom" valuePropName="checked"><input type="checkbox" /></Form.Item>
          </Space>
          <Form.Item label="封锁日期（可空=立即封锁至修复）" name="range"><DatePicker.RangePicker /></Form.Item>
          <Form.Item label="问题标题" name="title" rules={[{ required: true }]}><Input placeholder="如：空调不制冷" /></Form.Item>
          <Form.Item label="现象描述" name="description"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
