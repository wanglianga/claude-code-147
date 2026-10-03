import React, { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { data } = await axios.post('/api/auth/login', values);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      message.success('登录成功');
      navigate('/');
    } catch (e) {
      message.error(e.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#1d4a35,#2f6b4f 60%,#7fb069)' }}>
      <Card style={{ width: 380, boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>云溪山居民宿</Typography.Title>
        <Typography.Paragraph style={{ textAlign: 'center', color: '#888' }}>旺季房态 · 保洁布草 · 早餐 · 差评补偿平台</Typography.Paragraph>
        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'owner', password: '123456' }}>
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input size="large" placeholder="owner" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" placeholder="123456" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>登 录</Button>
        </Form>
        <Typography.Paragraph style={{ marginTop: 16, color: '#999', fontSize: 12, marginBottom: 0 }}>
          演示账号（密码均 123456）：owner 店主 / steward 管家 / cleaner1、cleaner2 保洁 / kitchen 厨房 / front 前台
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
