import React, { useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'antd';
import dayjs from 'dayjs';
import api, { ROOM_STATUS } from '../api';

const TYPES = { ac: '空调', plumbing: '水电', furniture: '家具', appliance: '电器', other: '其他' };
const STATUS = { open: { text: '待处理', color: 'red' }, fixing: { text: '维修中', color: 'orange' }, fixed: { text: '已修复', color: 'green' } };

export default function Maintenance() {
  const [list, setList] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const [t, r] = await Promise.all([api.get('/maintenance'), api.get('/rooms')]);
    setList(t); setRooms(r);
  };
  useEffect(() => { load(); }, []);

  const act = async (fn, ok) => { await fn(); message.success(ok); load(); };

  return (
    <Card title="维修工单" extra={<Button type="primary" onClick={() => setOpen(true)}>报修</Button>}>
      <Table dataSource={list} rowKey="id" columns={[
        { title: '房间', dataIndex: ['room', 'code'], width: 80 },
        { title: '类型', dataIndex: 'type', width: 80, render: (v) => TYPES[v] || v },
        { title: '描述', dataIndex: 'description' },
        { title: '房态', dataIndex: ['room', 'status'], width: 90, render: (v) => <Tag color={ROOM_STATUS[v]?.color}>{ROOM_STATUS[v]?.text}</Tag> },
        { title: '成本', dataIndex: 'cost', width: 90, render: (v) => `¥${v}` },
        { title: '状态', dataIndex: 'status', width: 90, render: (v) => <Tag color={STATUS[v].color}>{STATUS[v].text}</Tag> },
        { title: '报修时间', dataIndex: 'reportedAt', width: 150, render: (v) => dayjs(v).format('MM-DD HH:mm') },
        { title: '操作', width: 150, render: (_, r) => (
          <Space>
            {r.status === 'open' && <a onClick={() => act(() => api.post(`/maintenance/${r.id}/start`), '已开始维修')}>开始维修</a>}
            {['open', 'fixing'].includes(r.status) && (
              <a onClick={async () => {
                const cost = window.prompt('维修成本（¥）', String(r.cost || 0));
                if (cost !== null) await act(() => api.post(`/maintenance/${r.id}/resolve`, { cost: Number(cost) || 0 }), '已修复，房间转入待打扫');
              }}>修复</a>
            )}
          </Space>
        ) },
      ]} />
      <Modal title="新建报修" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="提交"
        destroyOnClose>
        <Form form={form} layout="vertical" onFinish={async (v) => {
          await api.post('/maintenance', v);
          message.success('已报修，房间转入维修状态');
          setOpen(false); load();
        }}>
          <Form.Item name="roomId" label="房间" rules={[{ required: true }]}>
            <Select options={rooms.map((r) => ({ value: r.id, label: `${r.code} ${r.roomType.name}` }))} />
          </Form.Item>
          <Form.Item name="type" label="类型" initialValue="ac">
            <Select options={Object.entries(TYPES).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item name="description" label="故障描述" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
